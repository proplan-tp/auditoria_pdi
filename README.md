# Portal Web — Plano de Desenvolvimento Institucional (PDI 2026–2029)

> **Interface Web Institucional, Governança e Acompanhamento Contínuo**

[![Architecture](https://img.shields.io/badge/architecture-decoupled%20web%20portal-blue?style=flat-square)](#arquitetura-e-tecnologias)
[![UI System](https://img.shields.io/badge/ui-Institutional%20Intelligence-teal?style=flat-square)](#design-system-e-interface)
[![License](https://img.shields.io/badge/governance-institutional-slate?style=flat-square)](#governança-e-propriedade)

---

## Visão Geral

Este repositório contém a interface web pública do **Portal do Plano de Desenvolvimento Institucional (PDI 2026–2029)**. 

O portal foi concebido para fornecer uma experiência fluida, moderna e responsiva de navegação documental e relatórios analíticos para a comunidade institucional, integrando autenticação baseada em contas institucionais e um visualizador integrado de documentos.

---

## Arquitetura e Tecnologias

A aplicação adota uma arquitetura estática leve (*Single Page Application / Shell*) sem frameworks pesados ou dependências de terceiros no frontend:

- **HTML5 Semântico:** Marcação acessível (WAI-ARIA), landmarks estruturais e isolamento de conteúdo via `<iframe>` em sandbox seguro.
- **CSS3 Moderno:** Folha de estilos orientada a tokens de design (*CSS Custom Properties*), layout responsivo em Flexbox/Grid e gaveta (*drawer*) deslizante para dispositivos móveis (telas ≤ 768px).
- **Vanilla JavaScript (ES6+):** Controlador desacoplado baseado em injeção de dependências e manipulação reativa de estado em memória.
- **Google Identity Services (GIS):** Integração com o SDK oficial do Google para autenticação via popup com contas institucionais.

---

## Design System e Interface

A interface foi modelada sob o padrão visual **Institutional Intelligence System**:

- **Paleta de Cores:**
  - *Petroleum Teal* (`#13998c` / `#00685e`): Ações primárias, foco e indicadores ativos.
  - *Dark Navy* (`#173f5f` / `#1f5f8b`): Topbar institucional e tipografia estrutural.
  - *Slate Neutrals* (`#f8fafc`, `#e2e8f0`, `#0f172a`): Superfícies de leitura com alto contraste e baixo cansaço visual.
  - *Status Accents* (`#10b981`, `#ef4444`): Indicadores de status e alertas.
- **Tipografia:** Família `Inter` com hierarquia sistemática para leitura densa de documentos analíticos.
- **Responsividade:** Layout adaptativo com topbar de 64px e sidebar de 280px em desktop, e topbar de 56px com drawer off-canvas em telas móveis e tablets.

---

## Estrutura do Repositório

```text
auditoria_pdi/
├── index.html                   # Casca da aplicação (Login Gate + Hub de visualização)
├── config.js                    # Configurações do frontend (Client ID e URL da API)
├── assets/
│   ├── css/
│   │   └── portal.css           # Estilos e tokens do Design System Institucional
│   └── js/
│       └── portal.js            # Controlador da SPA (GIS, renderização e sessões)
├── .gitignore                   # Regras de proteção do repositório
└── README.md                    # Apresentação do projeto
```

---

## Servidor de Desenvolvimento Local

Para executar e visualizar a interface localmente:

```bash
# Via Python 3
python -m http.server 8000

# Ou via npx
npx serve .
```

Acesse `http://localhost:8000` no seu navegador.

---

## Governança e Propriedade

Desenvolvido para fins de acompanhamento, governança e transparência no âmbito do **Plano de Desenvolvimento Institucional (PDI 2026–2029)**.  
Todos os direitos reservados à instituição mantenedora.
