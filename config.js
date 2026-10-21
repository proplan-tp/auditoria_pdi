/**
 * Configuração pública do Portal de Auditoria PDI
 * ATENÇÃO: O googleClientId e a webAppUrl são valores públicos por definição.
 */
const APP_CONFIG = {
  // Google OAuth 2.0 Web Client ID cadastrado no Google Cloud Console
  // com a origem autorizada https://seu-usuario.github.io
  googleClientId: "1030162673436-12chjcu4mpa22o4rt2tl9mira2668dfq.apps.googleusercontent.com",

  // URL do WebApp do Google Apps Script publicado com 'Executar como eu' e 'Qualquer pessoa'
  webAppUrl: "https://script.google.com/macros/s/AKfycbwe17PSGD5qWl2PhIajjxLpJ3wQuIp1wYDJeDnEPFd2hbv0ZeVUvUmLtA2CVLbVb0FOog/exec"
};

if (typeof window !== "undefined") {
  window.APP_CONFIG = APP_CONFIG;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { APP_CONFIG };
}
