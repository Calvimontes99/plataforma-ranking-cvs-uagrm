import Keycloak from 'keycloak-js';

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? '/auth',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'recruitment',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'recruitment-frontends'
});

export async function restoreSharedSession(): Promise<void> {
  await keycloak.init({
    onLoad: 'check-sso',
    pkceMethod: 'S256',
    silentCheckSsoRedirectUri: `${window.location.origin}/portal/silent-check-sso.html`,
    checkLoginIframe: false
  });
}
