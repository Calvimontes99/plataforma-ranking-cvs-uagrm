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
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey, 'Idempotency-Key': idempotencyKey, ...bearer() }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function watchPlatformEvents(onEvent: (event: any) => void, signal: AbortSignal): Promise<void> {
  let retryMs = 1000;
  while (!signal.aborted) {
    try {
      const response = await fetch('/api/v1/notifications/events', {
        headers: { Accept: 'text/event-stream', ...bearer() },
        signal,
      });
      if (!response.ok || !response.body) throw new Error(`SSE HTTP ${response.status}`);
      retryMs = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim()).join('\n');
          if (data) {
            try { onEvent(JSON.parse(data)); } catch { /* Ignore malformed event frames. */ }
          }
        }
      }
      await reader.cancel();
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
    }
    if (!signal.aborted) {
      await new Promise<void>(resolve => {
        const finish = () => {
          window.clearTimeout(timer);
          signal.removeEventListener('abort', finish);
          resolve();
        };
        const timer = window.setTimeout(finish, retryMs);
        signal.addEventListener('abort', finish, { once: true });
      });
      retryMs = Math.min(retryMs * 2, 15000);
    }
  }
}
