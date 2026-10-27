/**
 * Lógica do Portal de Auditoria PDI
 */
(function () {
  'use strict';

  function createPortal(context = {}) {
    const doc = context.document || (typeof document !== 'undefined' ? document : null);
    const win = context.window || (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
    const storage = context.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : (win && win.sessionStorage));
    const localStore = context.localStorage || (win && win.localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);
    const appConfig = context.APP_CONFIG || (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG : (win && win.APP_CONFIG));

    // Estado da aplicação
    const state = {
      idToken: null,
      userEmail: null,
      role: null,
      sector: null,
      allowedReports: [],
      reportsCache: {}, // { reportKey: { title, html } }
      currentReportKey: null,
      assignments: {},
      currentAssignSector: null
    };

    const KNOWN_REPORTS = [
      'CONSOLIDADO', 'METODOLOGIA',
      'CDBEA', 'CIEFAM', 'COBIB', 'CPA', 'CPPTA', 'CTIC',
      'INOVATEC', 'JBOT', 'OUVIDORIA', 'PROAD', 'PROCULT',
      'PROEAD', 'PROEST', 'PROEX', 'PROGEP', 'PROGRAD',
      'PROINFRA', 'PROPLAN', 'PRPGP'
    ];

    function isValidReportKey(key) {
      if (!key || typeof key !== 'string') return false;
      const upper = key.trim().toUpperCase();
      if (state.allowedReports && state.allowedReports.length > 0) {
        return state.allowedReports.some(r => {
          const reportCode = typeof r === 'string' ? r : (r && r.key);
          return reportCode && reportCode.toUpperCase() === upper;
        });
      }
      return KNOWN_REPORTS.includes(upper);
    }

    function extractReportKey(href) {
      if (!href || typeof href !== 'string') return null;
      const trimmed = href.trim();

      // 1. Caso hash ou query: #setor=CDBEA, ?setor=CDBEA, #report=CDBEA, #CDBEA
      const hashParamMatch = trimmed.match(/[#?&](?:setor|sector|report)=([A-Za-z0-9_-]+)/i);
      if (hashParamMatch) {
        return hashParamMatch[1].toUpperCase();
      }
      const directHashMatch = trimmed.match(/^#([A-Za-z0-9_-]+)$/);
      if (directHashMatch) {
        const candidate = directHashMatch[1].toUpperCase();
        if (isValidReportKey(candidate)) return candidate;
      }

      // 2. Caso caminho relativo ou absoluto para HTML: ../feedbacks/CDBEA.html, feedbacks/CDBEA.html, CDBEA.html
      const fileMatch = trimmed.match(/(?:^|\/|\.\.\/)?(?:feedbacks\/)?([A-Za-z0-9_-]+)\.html(?:[?#].*)?$/i);
      if (fileMatch) {
        const candidate = fileMatch[1].toUpperCase();
        if (candidate !== 'INDEX' && candidate !== 'LOGIN' && candidate !== '404') {
          return candidate;
        }
      }

      return null;
    }

    function attachIframeClickInterceptor() {
      if (!elements.viewerIframe) return;
      try {
        const iframeDoc = elements.viewerIframe.contentDocument ||
          (elements.viewerIframe.contentWindow && elements.viewerIframe.contentWindow.document);
        if (!iframeDoc || !iframeDoc.body) return;

        if (iframeDoc._pdiInterceptorBound) return;
        iframeDoc._pdiInterceptorBound = true;

        iframeDoc.body.addEventListener('click', (e) => {
          const link = e.target && e.target.closest ? e.target.closest('a') : null;
          if (!link) return;

          const explicitKey = (link.dataset && (link.dataset.reportKey || link.dataset.sector)) || '';
          const keyFromHref = extractReportKey(link.getAttribute('href') || '');
          const targetKey = (explicitKey || keyFromHref || '').toUpperCase();

          if (targetKey && isValidReportKey(targetKey)) {
            e.preventDefault();
            e.stopPropagation();
            switchReport(targetKey);
          }
        }, true);
      } catch (err) {
        // Fallback silencioso caso haja restrição de cross-origin sandbox
      }
    }

    function handleWindowMessage(event) {
      if (!event || !event.data) return;
      const data = event.data;
      if (data.type === 'pdi:navigate' || data.action === 'switchReport') {
        const key = data.reportKey || data.sector || data.key;
        if (key && isValidReportKey(key)) {
          switchReport(key.toUpperCase());
        }
      }
    }

    // Elementos do DOM
    const elements = {
      loginOverlay: doc ? doc.getElementById('loginOverlay') : null,
      gisButtonDiv: doc ? doc.getElementById('gisButtonDiv') : null,
      authAlertError: doc ? doc.getElementById('authAlertError') : null,
      errorMessage: doc ? doc.getElementById('errorMessage') : null,
      btnRetryAccount: doc ? doc.getElementById('btnRetryAccount') : null,

      portalContainer: doc ? doc.getElementById('portalContainer') : null,
      topbarBrand: doc ? doc.getElementById('topbarBrand') : null,
      userEmailDisplay: doc ? doc.getElementById('userEmailDisplay') : null,
      badgeRole: doc ? doc.getElementById('badgeRole') : null,
      btnFullscreen: doc ? doc.getElementById('btnFullscreen') : null,
      btnLogout: doc ? doc.getElementById('btnLogout') : null,
      btnHamburger: doc ? doc.getElementById('btnHamburger') : null,

      portalSidebar: doc ? doc.getElementById('portalSidebar') : null,
      sidebarBackdrop: doc ? doc.getElementById('sidebarBackdrop') : null,
      sidebarNavContainer: doc ? doc.getElementById('sidebarNavContainer') : null,

      viewerIframe: doc ? doc.getElementById('viewerIframe') : null,
      viewerLoading: doc ? doc.getElementById('viewerLoading') : null,

      // Modal de Atribuição
      assignModal: doc ? doc.getElementById('assignModal') : null,
      assignModalTitle: doc ? doc.getElementById('assignModalTitle') : null,
      assignSectorName: doc ? doc.getElementById('assignSectorName') : null,
      btnCloseAssignModal: doc ? doc.getElementById('btnCloseAssignModal') : null,
      assignRevisorInput: doc ? doc.getElementById('assignRevisorInput') : null,
      assignStatusSelect: doc ? doc.getElementById('assignStatusSelect') : null,
      btnClearAssignment: doc ? doc.getElementById('btnClearAssignment') : null,
      btnCancelAssignment: doc ? doc.getElementById('btnCancelAssignment') : null,
      btnSaveAssignment: doc ? doc.getElementById('btnSaveAssignment') : null
    };

    function initApp() {
      setupEventListeners();
      checkExistingSession();
    }

    function setupEventListeners() {
      if (elements.btnLogout) {
        elements.btnLogout.addEventListener('click', handleLogout);
      }
      if (elements.btnFullscreen) {
        elements.btnFullscreen.addEventListener('click', toggleFullscreen);
      }
      if (elements.btnHamburger) {
        elements.btnHamburger.addEventListener('click', () => {
          const width = (win && typeof win.innerWidth === 'number') ? win.innerWidth : 1024;
          if (width > 768) {
            toggleSidebarDesktop();
          } else {
            toggleMobileSidebar();
          }
        });
      }
      if (elements.sidebarBackdrop) {
        elements.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
      }
      if (elements.btnRetryAccount) {
        elements.btnRetryAccount.addEventListener('click', () => {
          if (elements.authAlertError) {
            elements.authAlertError.classList.remove('active');
          }
          handleLogout();
        });
      }

      // Modal de Atribuição listeners
      if (elements.btnCloseAssignModal) {
        elements.btnCloseAssignModal.addEventListener('click', closeAssignModal);
      }
      if (elements.btnCancelAssignment) {
        elements.btnCancelAssignment.addEventListener('click', closeAssignModal);
      }
      if (elements.btnSaveAssignment) {
        elements.btnSaveAssignment.addEventListener('click', saveAssignment);
      }
      if (elements.btnClearAssignment) {
        elements.btnClearAssignment.addEventListener('click', clearAssignment);
      }
      if (elements.assignModal) {
        elements.assignModal.addEventListener('click', (e) => {
          if (e && e.target === elements.assignModal) {
            closeAssignModal();
          }
        });
      }

      // Sincronização de navegação pelo histórico (botão Voltar/Avançar do navegador)
      if (win && win.addEventListener) {
        win.addEventListener('popstate', () => {
          if (!win.location || !state.idToken) return;
          const hashCandidate = (win.location.hash || '').replace(/^#/, '').toUpperCase();
          if (hashCandidate && isValidReportKey(hashCandidate) && hashCandidate !== state.currentReportKey) {
            switchReport(hashCandidate);
          }
        });

        // Recepção de mensagens do iframe para troca de relatório
        win.addEventListener('message', handleWindowMessage);
      }

      // Interceptor de cliques no iframe para direcionar links internos ao SPA
      if (elements.viewerIframe && elements.viewerIframe.addEventListener) {
        elements.viewerIframe.addEventListener('load', attachIframeClickInterceptor);
      }
    }

    function checkExistingSession() {
      const savedToken = storage ? storage.getItem('pdi_id_token') : null;
      if (savedToken) {
        state.idToken = savedToken;
        loadInitialPortalData();
      } else {
        showLoginScreen();
      }
    }

    function showLoginScreen() {
      if (elements.portalContainer) elements.portalContainer.style.display = 'none';
      if (elements.loginOverlay) elements.loginOverlay.style.display = 'flex';
      initGoogleIdentityServices();
    }

    function initGoogleIdentityServices() {
      const googleObj = (win && win.google) || (typeof google !== 'undefined' ? google : null);
      if (!googleObj || !googleObj.accounts) {
        setTimeout(initGoogleIdentityServices, 100);
        return;
      }

      googleObj.accounts.id.initialize({
        client_id: appConfig ? appConfig.googleClientId : '',
        callback: handleCredentialResponse,
        auto_select: false
      });

      if (elements.gisButtonDiv) {
        googleObj.accounts.id.renderButton(
          elements.gisButtonDiv,
          { theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 280 }
        );
      }
    }

    function handleCredentialResponse(response) {
      if (!response || !response.credential) {
        showAuthError('Falha ao obter credenciais do Google.');
        return;
      }

      state.idToken = response.credential;
      if (storage) {
        storage.setItem('pdi_id_token', state.idToken);
      }
      loadInitialPortalData();
    }

    async function loadInitialPortalData() {
      setLoading(true);
      if (elements.authAlertError) {
        elements.authAlertError.classList.remove('active');
      }

      try {
        let requestedKey = 'INIT';
        if (win && win.location && win.location.hash) {
          const hashCandidate = win.location.hash.replace(/^#/, '').toUpperCase();
          if (isValidReportKey(hashCandidate)) {
            requestedKey = hashCandidate;
          }
        }

        const fetchFn = (win && win.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
        const webUrl = appConfig ? appConfig.webAppUrl : '';
        const response = await fetchFn(webUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ idToken: state.idToken, reportKey: requestedKey })
        });

        const data = await response.json();

        if (!data.success) {
          setLoading(false);
          showAuthError(data.error || 'Acesso não autorizado.');
          if (storage) {
            storage.removeItem('pdi_id_token');
          }
          return;
        }

        // Sucesso na autorização
        state.userEmail = data.email;
        state.role = data.role;
        state.sector = data.sector;
        state.allowedReports = data.allowedReports || [];
        state.currentReportKey = data.currentReport;

        // Sincroniza hash inicial no navegador se aplicável
        if (win && win.location && win.history && win.history.replaceState) {
          win.history.replaceState({ reportKey: data.currentReport }, '', '#' + data.currentReport);
        }

        // Armazena em cache o relatório inicial recebido
        state.reportsCache[data.currentReport] = {
          title: data.reportTitle,
          html: data.html
        };

        renderAuthenticatedUI(data);
        renderReportInViewer(data.currentReport);

      } catch (err) {
        setLoading(false);
        showAuthError('Erro ao comunicar com o servidor de auditoria: ' + err.message);
        if (storage) {
          storage.removeItem('pdi_id_token');
        }
      }
    }

    function renderAuthenticatedUI(data) {
      if (elements.loginOverlay) elements.loginOverlay.style.display = 'none';
      if (elements.portalContainer) elements.portalContainer.style.display = 'flex';

      if (elements.userEmailDisplay) elements.userEmailDisplay.textContent = state.userEmail;

      if (state.role === 'admin') {
        if (elements.badgeRole) {
          elements.badgeRole.textContent = 'Visão Geral';
          elements.badgeRole.className = 'badge-role admin';
        }
        renderAdminSidebar(data.allowedReports || []);
        if (elements.btnHamburger) {
          elements.btnHamburger.style.display = '';
          elements.btnHamburger.classList.add('visible-desktop');
        }
        restoreSidebarPreference();
      } else {
        if (elements.badgeRole) {
          elements.badgeRole.textContent = 'Setor: ' + (state.sector || '');
          elements.badgeRole.className = 'badge-role sector';
        }
        if (elements.portalSidebar) elements.portalSidebar.style.display = 'none';
        if (elements.btnHamburger) {
          elements.btnHamburger.style.display = 'none';
          elements.btnHamburger.classList.remove('visible-desktop');
        }
      }
    }

    function renderAdminSidebar(reportsList) {
      if (elements.portalSidebar) elements.portalSidebar.style.display = 'flex';
      if (elements.sidebarNavContainer) elements.sidebarNavContainer.innerHTML = '';

      const centrals = (reportsList || []).filter(r => r.type === 'central');
      const sectors = (reportsList || []).filter(r => r.type === 'sector');

      if (centrals.length > 0 && elements.sidebarNavContainer) {
        const titleCentrals = doc.createElement('div');
        titleCentrals.className = 'sidebar-group-title';
        titleCentrals.textContent = 'Documentos Centrais';
        elements.sidebarNavContainer.appendChild(titleCentrals);

        centrals.forEach(rep => {
          elements.sidebarNavContainer.appendChild(createNavItem(rep));
        });
      }

      if (sectors.length > 0 && elements.sidebarNavContainer) {
        const titleSectors = doc.createElement('div');
        titleSectors.className = 'sidebar-group-title';
        titleSectors.textContent = 'Relatórios Setoriais';
        elements.sidebarNavContainer.appendChild(titleSectors);

        sectors.forEach(rep => {
          elements.sidebarNavContainer.appendChild(createNavItem(rep));
        });
      }
    }

    function createNavItem(rep) {
      const item = doc.createElement('a');
      item.className = 'nav-item' + (rep.key === state.currentReportKey ? ' active' : '');
      item.dataset.reportKey = rep.key;
      item.innerHTML = `<span>${rep.type === 'central' ? '📊' : '🏛️'}</span><span>${rep.title}</span>`;
      item.addEventListener('click', () => {
        switchReport(rep.key);
        closeMobileSidebar();
      });
      return item;
    }

    async function switchReport(reportKey) {
      if (!reportKey) return;
      const normalizedKey = reportKey.toUpperCase();

      if (state.currentReportKey === normalizedKey && state.reportsCache[normalizedKey]) return;

      // Atualiza classe ativa na sidebar
      if (elements.sidebarNavContainer) {
        const items = elements.sidebarNavContainer.querySelectorAll('.nav-item');
        items.forEach(el => {
          if (el.dataset && el.dataset.reportKey) {
            el.classList.toggle('active', el.dataset.reportKey === normalizedKey);
          }
        });
      }

      state.currentReportKey = normalizedKey;

      // Sincroniza hash na barra de endereço (permite deep-link e botão Voltar)
      if (win && win.location) {
        const targetHash = '#' + normalizedKey;
        if (win.location.hash !== targetHash) {
          if (win.history && win.history.pushState) {
            win.history.pushState({ reportKey: normalizedKey }, '', targetHash);
          } else {
            win.location.hash = targetHash;
          }
        }
      }

      if (state.reportsCache[normalizedKey]) {
        renderReportInViewer(normalizedKey);
        return;
      }

      // Busca do backend se não estiver no cache
      setLoading(true);
      try {
        const fetchFn = (win && win.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
        const webUrl = appConfig ? appConfig.webAppUrl : '';
        const res = await fetchFn(webUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ idToken: state.idToken, reportKey: normalizedKey })
        });
        const data = await res.json();
        if (!data.success) {
          const alertFn = (win && win.alert) || (typeof alert !== 'undefined' ? alert : console.error);
          alertFn(data.error || 'Erro ao carregar relatório.');
          setLoading(false);
          return;
        }

        state.reportsCache[normalizedKey] = {
          title: data.reportTitle,
          html: data.html
        };

        renderReportInViewer(normalizedKey);

      } catch (err) {
        const alertFn = (win && win.alert) || (typeof alert !== 'undefined' ? alert : console.error);
        alertFn('Falha na requisição: ' + err.message);
      } finally {
        setLoading(false);
      }
    }

    function renderReportInViewer(reportKey) {
      const reportData = state.reportsCache[reportKey];
      if (!reportData) return;

      if (elements.viewerIframe) {
        elements.viewerIframe.srcdoc = reportData.html;
        setTimeout(attachIframeClickInterceptor, 50);

        if (reportKey === 'CONSOLIDADO') {
          setTimeout(async () => {
            const iframeDoc = elements.viewerIframe ? (
              elements.viewerIframe.contentDocument ||
              (elements.viewerIframe.contentWindow && elements.viewerIframe.contentWindow.document)
            ) : null;
            if (iframeDoc) {
              if (state.role === 'admin') {
                await fetchAssignments();
              }
              hydrateConsolidatedTable(iframeDoc, state.assignments);
            }
          }, 60);
        }
      }
      setLoading(false);
    }

    function handleLogout() {
      if (storage) {
        storage.removeItem('pdi_id_token');
      }
      state.idToken = null;
      state.userEmail = null;
      state.role = null;
      state.sector = null;
      state.allowedReports = [];
      state.reportsCache = {};
      state.currentReportKey = null;
      state.assignments = {};
      state.currentAssignSector = null;
      if (elements.assignModal) {
        elements.assignModal.style.display = 'none';
      }
      if (elements.viewerIframe) {
        elements.viewerIframe.srcdoc = '';
      }
      if (win && win.location && win.history && win.history.replaceState) {
        win.history.replaceState(null, '', (win.location.pathname || '') + (win.location.search || ''));
      }
      showLoginScreen();
    }

    function showAuthError(msg) {
      if (elements.errorMessage) {
        elements.errorMessage.textContent = msg;
      }
      if (elements.authAlertError) {
        elements.authAlertError.classList.add('active');
      }
    }

    function setLoading(isLoading) {
      if (elements.viewerLoading) {
        elements.viewerLoading.classList.toggle('active', isLoading);
      }
    }

    function toggleSidebarDesktop() {
      if (!elements.portalSidebar) return false;
      const isCollapsed = elements.portalSidebar.classList.toggle('collapsed');
      try {
        const ls = localStore || (win && win.localStorage);
        if (ls) {
          ls.setItem('pdi_sidebar_collapsed', isCollapsed ? 'true' : 'false');
        }
      } catch (e) {}
      return isCollapsed;
    }

    function restoreSidebarPreference() {
      try {
        const ls = localStore || (win && win.localStorage);
        const width = (win && typeof win.innerWidth === 'number') ? win.innerWidth : 1024;
        if (ls && ls.getItem('pdi_sidebar_collapsed') === 'true' && width > 768) {
          if (elements.portalSidebar) {
            elements.portalSidebar.classList.add('collapsed');
          }
        }
      } catch (e) {}
    }

    function toggleMobileSidebar() {
      if (elements.portalSidebar) {
        elements.portalSidebar.classList.toggle('open');
      }
      if (elements.sidebarBackdrop) {
        elements.sidebarBackdrop.classList.toggle('active');
      }
    }

    function closeMobileSidebar() {
      if (elements.portalSidebar) {
        elements.portalSidebar.classList.remove('open');
      }
      if (elements.sidebarBackdrop) {
        elements.sidebarBackdrop.classList.remove('active');
      }
    }

    function toggleFullscreen() {
      if (!doc) return;
      if (!doc.fullscreenElement) {
        if (doc.documentElement && doc.documentElement.requestFullscreen) {
          doc.documentElement.requestFullscreen().catch(err => {
            const alertFn = (win && win.alert) || (typeof alert !== 'undefined' ? alert : console.error);
            alertFn('Não foi possível ativar modo tela cheia: ' + err.message);
          });
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen();
        }
      }
    }

    function renderStatusBadge(status) {
      const s = (status || 'PENDENTE').toUpperCase().trim();
      if (s === 'CONCLUIDO') {
        return '<span class="tag tag-concluido">Concluído</span>';
      }
      if (s === 'EM_VALIDACAO') {
        return '<span class="tag tag-em-validacao">Em Validação</span>';
      }
      if (s === 'EM_REVISAO') {
        return '<span class="tag tag-em-revisao">Em Revisão</span>';
      }
      return '<span class="tag tag-pendente">Pendente</span>';
    }

    async function fetchAssignments() {
      if (!state.idToken) return state.assignments || {};
      try {
        const fetchFn = (win && win.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
        const webUrl = appConfig ? appConfig.webAppUrl : '';
        const res = await fetchFn(webUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ idToken: state.idToken, action: 'GET_ASSIGNMENTS' })
        });
        const data = await res.json();
        if (data && data.success && data.assignments) {
          state.assignments = data.assignments;
          return state.assignments;
        }
      } catch (err) {
        // Silencioso em caso de erro de rede ou mock
      }
      return state.assignments || {};
    }

    function hydrateConsolidatedTable(iframeDoc, assignments) {
      if (!iframeDoc) return;
      const currentAssignments = assignments || state.assignments || {};
      const rows = iframeDoc.querySelectorAll ? iframeDoc.querySelectorAll('tr[data-setor]') : [];
      if (!rows || rows.length === 0) return;

      rows.forEach(row => {
        const setor = row.getAttribute ? row.getAttribute('data-setor') : null;
        if (!setor) return;

        const info = currentAssignments[setor];
        const revisor = (info && info.revisor) ? info.revisor : '—';
        const assignedBy = (info && info.assignedBy) ? info.assignedBy : '—';
        const status = (info && info.status) ? info.status : 'PENDENTE';

        const revCell = row.querySelector ? row.querySelector('[data-cell="revisor"]') : null;
        if (revCell) revCell.textContent = revisor;

        const byCell = row.querySelector ? row.querySelector('[data-cell="atribuido-por"]') : null;
        if (byCell) byCell.textContent = assignedBy;

        const statusCell = row.querySelector ? row.querySelector('[data-cell="status"]') : null;
        if (statusCell) {
          statusCell.innerHTML = renderStatusBadge(status);
        }

        // Se o usuário autenticado for admin, injeta botão interativo no slot da ação
        if (state.role === 'admin') {
          const slot = row.querySelector ? (
            row.querySelector('.btn-assign-slot[data-setor="' + setor + '"]') ||
            row.querySelector('.btn-assign-slot') ||
            row.querySelector('[data-cell="acao"]')
          ) : null;

          if (slot) {
            const hasAssignment = !!(info && info.revisor);
            slot.innerHTML = '';
            const btn = (iframeDoc && iframeDoc.createElement)
              ? iframeDoc.createElement('button')
              : (doc && doc.createElement ? doc.createElement('button') : null);
            if (btn) {
              btn.type = 'button';
              btn.className = 'btn-assign-action' + (hasAssignment ? ' edit' : '');
              btn.textContent = hasAssignment ? 'Editar Atribuição' : 'Atribuir';
              btn.addEventListener('click', (e) => {
                if (e && e.preventDefault) e.preventDefault();
                if (e && e.stopPropagation) e.stopPropagation();
                openAssignModal(setor);
              });
              slot.appendChild(btn);
            }
          }
        }
      });
    }

    function openAssignModal(setor) {
      if (!setor) return;
      state.currentAssignSector = setor;
      if (elements.assignSectorName) {
        elements.assignSectorName.textContent = setor;
      }
      const current = (state.assignments && state.assignments[setor]) || {};
      if (elements.assignRevisorInput) {
        elements.assignRevisorInput.value = current.revisor || '';
      }
      if (elements.assignStatusSelect) {
        elements.assignStatusSelect.value = current.status || 'PENDENTE';
      }
      if (elements.assignModal) {
        elements.assignModal.style.display = 'flex';
      }
    }

    function closeAssignModal() {
      state.currentAssignSector = null;
      if (elements.assignModal) {
        elements.assignModal.style.display = 'none';
      }
    }

    async function saveAssignment() {
      const setor = state.currentAssignSector;
      if (!setor) return;

      const revisor = elements.assignRevisorInput ? elements.assignRevisorInput.value.trim() : '';
      const status = elements.assignStatusSelect ? elements.assignStatusSelect.value : 'PENDENTE';

      try {
        const fetchFn = (win && win.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
        const webUrl = appConfig ? appConfig.webAppUrl : '';
        const res = await fetchFn(webUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            idToken: state.idToken,
            action: 'SET_ASSIGNMENT',
            setor: setor,
            revisor: revisor,
            status: status
          })
        });
        const data = await res.json();
        if (data && !data.success) {
          const alertFn = (win && win.alert) || (typeof alert !== 'undefined' ? alert : console.error);
          alertFn(data.error || 'Erro ao processar atribuição.');
          return;
        }
        if (data && data.success && data.assignments) {
          state.assignments = data.assignments;
        }
      } catch (err) {
        const alertFn = (win && win.alert) || (typeof alert !== 'undefined' ? alert : console.error);
        alertFn('Erro ao salvar atribuição: ' + err.message);
      } finally {
        closeAssignModal();
        const iframeDoc = elements.viewerIframe ? (
          elements.viewerIframe.contentDocument ||
          (elements.viewerIframe.contentWindow && elements.viewerIframe.contentWindow.document)
        ) : null;
        if (iframeDoc) {
          hydrateConsolidatedTable(iframeDoc, state.assignments);
        }
      }
    }

    async function clearAssignment() {
      const setor = state.currentAssignSector;
      if (!setor) return;

      try {
        const fetchFn = (win && win.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
        const webUrl = appConfig ? appConfig.webAppUrl : '';
        const res = await fetchFn(webUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            idToken: state.idToken,
            action: 'SET_ASSIGNMENT',
            setor: setor,
            revisor: '',
            status: 'PENDENTE'
          })
        });
        const data = await res.json();
        if (data && !data.success) {
          const alertFn = (win && win.alert) || (typeof alert !== 'undefined' ? alert : console.error);
          alertFn(data.error || 'Erro ao processar atribuição.');
          return;
        }
        if (data && data.success && data.assignments) {
          state.assignments = data.assignments;
        } else if (data && data.success && state.assignments) {
          delete state.assignments[setor];
        }
      } catch (err) {
        const alertFn = (win && win.alert) || (typeof alert !== 'undefined' ? alert : console.error);
        alertFn('Erro ao remover atribuição: ' + err.message);
      } finally {
        closeAssignModal();
        const iframeDoc = elements.viewerIframe ? (
          elements.viewerIframe.contentDocument ||
          (elements.viewerIframe.contentWindow && elements.viewerIframe.contentWindow.document)
        ) : null;
        if (iframeDoc) {
          hydrateConsolidatedTable(iframeDoc, state.assignments);
        }
      }
    }

    return {
      state,
      elements,
      initApp,
      setupEventListeners,
      checkExistingSession,
      showLoginScreen,
      initGoogleIdentityServices,
      handleCredentialResponse,
      loadInitialPortalData,
      renderAuthenticatedUI,
      renderAdminSidebar,
      createNavItem,
      switchReport,
      renderReportInViewer,
      handleLogout,
      showAuthError,
      setLoading,
      toggleSidebarDesktop,
      toggleDesktopSidebar: toggleSidebarDesktop,
      restoreSidebarPreference,
      toggleMobileSidebar,
      closeMobileSidebar,
      toggleFullscreen,
      extractReportKey,
      isValidReportKey,
      handleWindowMessage,
      attachIframeClickInterceptor,
      renderStatusBadge,
      fetchAssignments,
      hydrateConsolidatedTable,
      openAssignModal,
      closeAssignModal,
      saveAssignment,
      clearAssignment
    };
  }

  // Auto-inicialização quando executado diretamente no navegador
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const portalInstance = createPortal({
      document: document,
      window: window,
      sessionStorage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
      localStorage: typeof localStorage !== 'undefined' ? localStorage : null,
      APP_CONFIG: typeof APP_CONFIG !== 'undefined' ? APP_CONFIG : window.APP_CONFIG
    });
    window.Portal = portalInstance;
    document.addEventListener('DOMContentLoaded', portalInstance.initApp);
  }

  // Exportação para ambiente Node.js / CommonJS (suíte de testes automatizados)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createPortal };
  }
})();
