import Keycloak from 'keycloak-js';

export const keycloak = new Keycloak({ url: `${location.origin}/auth`, realm: 'recruitment', clientId: 'erp-web' });

export async function initializeSso(): Promise<string | null> {
  if (new URLSearchParams(location.search).get('switch-account') === '1') {
    await keycloak.init({ onLoad: 'check-sso', checkLoginIframe: false });
    await keycloak.logout({ redirectUri: `${location.origin}/erp/` });
    return null;
  }

  const authenticated = await keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false });
  if (!authenticated || !keycloak.token) throw new Error('No fue posible iniciar sesión');
  const roles = keycloak.tokenParsed?.realm_access?.roles ?? [];
  const hasStaffRole = roles.some(role => ['ADMIN', 'RRHH', 'AI_AGENT'].includes(role));

  if (roles.includes('CANDIDATE') && !hasStaffRole) {
    location.replace('/portal/');
    return null;
  }
  if (!hasStaffRole) throw new Error('Tu cuenta no tiene permisos para acceder al ERP');

  setInterval(() => void keycloak.updateToken(45), 30_000);
  return keycloak.token;
}

export function bearer(): Record<string, string> {
  return keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {};
}
