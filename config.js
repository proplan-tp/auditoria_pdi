/**
 * Configuração pública do Portal de Auditoria PDI
 * ATENÇÃO: O googleClientId e a webAppUrl são valores públicos por definição.
 */
const APP_CONFIG = {
  // Google OAuth 2.0 Web Client ID cadastrado no Google Cloud Console
  // com a origem autorizada https://seu-usuario.github.io
  googleClientId: "COLOQUE_SEU_GOOGLE_CLIENT_ID_AQUI.apps.googleusercontent.com",

  // URL do WebApp do Google Apps Script publicado com 'Executar como eu' e 'Qualquer pessoa'
  webAppUrl: "COLOQUE_AQUI_A_URL_DO_WEBAPP_APPS_SCRIPT/exec"
};

if (typeof window !== "undefined") {
  window.APP_CONFIG = APP_CONFIG;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { APP_CONFIG };
}
