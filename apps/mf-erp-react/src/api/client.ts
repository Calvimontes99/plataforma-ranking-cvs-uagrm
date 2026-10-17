import { ApolloClient, HttpLink, InMemoryCache, gql } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { bearer } from '../auth/keycloak';

export const client = new ApolloClient({
  link: setContext((_, context) => ({ headers: { ...context.headers, ...bearer() } })).concat(new HttpLink({ uri: '/graphql' })),
  cache: new InMemoryCache(),
});

export const VACANCIES = gql`query Vacantes { vacantesAbiertas(limite: 20) { id titulo cupoDisponible estado } }`;
export const CANDIDATES = gql`query Postulantes($vacanteId: ID!) { postulantesPreaprobados(vacanteId: $vacanteId) { candidatoId nombreCompleto puntajeRanking pretensionSalarial } }`;

export async function postJson<T>(url: string, body: unknown, idempotencyKey = crypto.randomUUID()): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey, ...bearer() }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
