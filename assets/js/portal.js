/**
 * Lógica do Portal de Auditoria PDI
 */
(function () {
  'use strict';

  function createPortal(context = {}) {
    const doc = context.document || (typeof document !== 'undefined' ? document : null);
    const win = context.window || (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
    const storage = context.sessionStorage || (typeof sessionStorage !== 'undefined' ? sessionStorage : (win && win.sessionStorage));
    const appConfig = context.APP_CONFIG || (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG : (win && win.APP_CONFIG));

    // Estado da aplicação
    const state = {
      idToken: null,
      userEmail: null,
      role: null,
      sector: null,
      reportsCache: {}, // { reportKey: { title, html } }
      currentReportKey: null
    };

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
      viewerLoading: doc ? doc.getElementById('viewerLoading') : null
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
        elements.btnHamburger.addEventListener('click', toggleMobileSidebar);
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
        const fetchFn = (win && win.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
        const webUrl = appConfig ? appConfig.webAppUrl : '';
        const response = await fetchFn(webUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ idToken: state.idToken, reportKey: 'INIT' })
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
        state.currentReportKey = data.currentReport;

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
        if (elements.btnHamburger) elements.btnHamburger.style.display = '';
      } else {
        if (elements.badgeRole) {
          elements.badgeRole.textContent = 'Setor: ' + (state.sector || '');
          elements.badgeRole.className = 'badge-role sector';
        }
        if (elements.portalSidebar) elements.portalSidebar.style.display = 'none';
        if (elements.btnHamburger) elements.btnHamburger.style.display = 'none';
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
      if (state.currentReportKey === reportKey && state.reportsCache[reportKey]) return;

      // Atualiza classe ativa na sidebar
      if (elements.sidebarNavContainer) {
        const items = elements.sidebarNavContainer.querySelectorAll('.nav-item');
        items.forEach(el => {
          if (el.dataset && el.dataset.reportKey) {
            el.classList.toggle('active', el.dataset.reportKey === reportKey);
          }
        });
      }

      state.currentReportKey = reportKey;

      if (state.reportsCache[reportKey]) {
        renderReportInViewer(reportKey);
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
          body: JSON.stringify({ idToken: state.idToken, reportKey: reportKey })
        });
        const data = await res.json();
        if (!data.success) {
          const alertFn = (win && win.alert) || (typeof alert !== 'undefined' ? alert : console.error);
          alertFn(data.error || 'Erro ao carregar relatório.');
          setLoading(false);
          return;
        }

        state.reportsCache[reportKey] = {
          title: data.reportTitle,
          html: data.html
        };

        renderReportInViewer(reportKey);

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
      state.reportsCache = {};
      state.currentReportKey = null;
      if (elements.viewerIframe) {
        elements.viewerIframe.srcdoc = '';
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
      toggleMobileSidebar,
      closeMobileSidebar,
      toggleFullscreen
    };
  }

  // Auto-inicialização quando executado diretamente no navegador
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const portalInstance = createPortal({
      document: document,
      window: window,
      sessionStorage: typeof sessionStorage !== 'undefined' ? sessionStorage : null,
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
