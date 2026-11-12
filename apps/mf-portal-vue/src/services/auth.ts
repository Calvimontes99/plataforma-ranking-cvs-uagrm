import Keycloak from 'keycloak-js';

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? '/auth',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'recruitment',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'recruitment-frontends'
});

export async function requireCandidateSession(): Promise<boolean> {
  if (new URLSearchParams(window.location.search).get('switch-account') === '1') {
    await keycloak.init({ onLoad: 'check-sso', checkLoginIframe: false });
    await keycloak.logout({ redirectUri: `${window.location.origin}/portal/` });
    return false;
  }

  const authenticated = await keycloak.init({
    onLoad: 'login-required',
    pkceMethod: 'S256',
    silentCheckSsoRedirectUri: `${window.location.origin}/portal/silent-check-sso.html`,
    checkLoginIframe: false
  });
  if (!authenticated || !keycloak.token) throw new Error('No fue posible iniciar sesión');
  const roles = keycloak.tokenParsed?.realm_access?.roles ?? [];
  const hasStaffRole = roles.some(role => ['ADMIN', 'RRHH', 'AI_AGENT'].includes(role));

  if (hasStaffRole) {
    window.location.replace('/erp/');
    return false;
  }
  if (!roles.includes('CANDIDATE')) throw new Error('Tu cuenta no tiene permisos para postular');

  window.setInterval(() => void keycloak.updateToken(45), 30_000);
  return true;
}

export async function authorizationHeaders(): Promise<Record<string, string>> {
  await keycloak.updateToken(30);
  if (!keycloak.token) throw new Error('La sesión expiró; vuelve a iniciar sesión');
  return { Authorization: `Bearer ${keycloak.token}` };
}
