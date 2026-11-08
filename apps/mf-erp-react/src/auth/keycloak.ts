import Keycloak from 'keycloak-js';

export const keycloak = new Keycloak({ url: `${location.origin}/auth`, realm: 'recruitment', clientId: 'erp-web' });

export async function initializeSso(): Promise<string> {
  // Desde la pantalla "Iniciar sesión" (?login=force) se cierra cualquier sesión SSO previa
  // para mostrar el formulario vacío y poder escribir otro usuario.
  const force = new URLSearchParams(location.search).get('login') === 'force';
  if (force) {
    const hadSession = await keycloak.init({ onLoad: 'check-sso', pkceMethod: 'S256', checkLoginIframe: false });
    if (hadSession) await keycloak.logout({ redirectUri: `${location.origin}/erp/` });
    else await keycloak.login({ redirectUri: `${location.origin}/erp/` });
    return new Promise<string>(() => undefined);
  }
  const authenticated = await keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false });
  if (!authenticated || !keycloak.token) throw new Error('No fue posible iniciar sesión');
  setInterval(() => void keycloak.updateToken(45), 30_000);
  return keycloak.token;
}

export function bearer(): Record<string, string> {
  return keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {};
}
