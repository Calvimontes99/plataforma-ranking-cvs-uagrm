import Keycloak from 'keycloak-js';

export const keycloak = new Keycloak({ url: `${location.origin}/auth`, realm: 'recruitment', clientId: 'erp-web' });

export async function initializeSso(): Promise<string> {
  const authenticated = await keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false });
  if (!authenticated || !keycloak.token) throw new Error('No fue posible iniciar sesión');
  setInterval(() => void keycloak.updateToken(45), 30_000);
  return keycloak.token;
}

export function bearer(): Record<string, string> {
  return keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {};
}
