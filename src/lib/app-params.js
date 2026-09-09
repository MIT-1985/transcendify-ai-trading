// Параметрите на приложението, които платформата инжектира при публикуване.
// Страницата OAuthConsent ги използва за consent-info и authorize-grant
// извикванията към MCP сървъра на приложението.

const injected =
  (typeof window !== "undefined" && (window.__APP_PARAMS__ || window.__app_params__)) || {};

export const appParams = {
  appId: injected.appId || import.meta.env?.VITE_APP_ID || "",
  token: injected.token || "",
};