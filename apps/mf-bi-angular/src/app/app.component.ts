import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { keycloak } from './core/auth';

type ReportResponse = {
  count: number;
  results: Record<string, unknown>[];
  query: ExportQuery;
};

type ExportQuery = {
  filters: Record<string, unknown>;
  fields: string[];
  limit: number;
  natural_language?: string | null;
};

type ClusterSummary = { name: string; count: number; size: number };
type ClusterResponse = {
  assignments: { candidateId: string; clusterName: string }[];
};

type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
  onstart: () => void;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly http = inject(HttpClient);

  query = 'Muéstrame postulaciones';
  results: Record<string, unknown>[] = [];
  columns: string[] = [];
  error = '';
  guardrailBlocked = false;
  loading = false;
  exporting = false;
  listening = false;
  microphoneMessage = '';
  exportError = '';
  clusterError = '';
  clusters: ClusterSummary[] = [];
  private lastSuccessfulQuery: ExportQuery | null = null;
  private clusterRequest = 0;

  ngOnInit(): void {
    this.run();
  }

  get evaluatedCount(): number {
    return this.results.filter((row) =>
      !['received', 'processing'].includes(String(row['application_status'] ?? '').toLowerCase()),
    ).length;
  }

  get preapprovedCount(): number {
    return this.results.filter((row) =>
      ['preapproved', 'selected'].includes(String(row['application_status'] ?? '').toLowerCase()),
    ).length;
  }

  get selectedCount(): number {
    return this.results.filter(
      (row) => String(row['application_status'] ?? '').toLowerCase() === 'selected',
    ).length;
  }

  get conversionRate(): string {
    return this.results.length
      ? ((this.preapprovedCount / this.results.length) * 100).toFixed(1)
      : '0.0';
  }

  get averageScore(): string {
    const scores = this.results
      .map((row) => Number(row['score']))
      .filter(Number.isFinite);
    return scores.length
      ? (scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(1)
      : '0.0';
  }

  get averageEvaluationDays(): string {
    const durations = this.results.flatMap((row) => {
      const created = Date.parse(String(row['created_at'] ?? ''));
      const evaluated = Date.parse(String(row['evaluated_at'] ?? ''));
      return Number.isFinite(created) && Number.isFinite(evaluated) && evaluated >= created
        ? [(evaluated - created) / 86_400_000]
        : [];
    });
    return durations.length
      ? (durations.reduce((total, days) => total + days, 0) / durations.length).toFixed(1)
      : '—';
  }

  get funnel(): { label: string; value: number; percent: number }[] {
    const total = this.results.length;
    return [
      { label: 'Postulaciones', value: total, percent: 100 },
      { label: 'Evaluados', value: this.evaluatedCount, percent: this.percentage(this.evaluatedCount, total) },
      { label: 'Preaprobados', value: this.preapprovedCount, percent: this.percentage(this.preapprovedCount, total) },
      { label: 'Seleccionados', value: this.selectedCount, percent: this.percentage(this.selectedCount, total) },
    ];
  }

  run(): void {
    this.loading = true;
    this.error = '';
    this.guardrailBlocked = false;
    this.http
      .post<ReportResponse>('/api/v1/read/reports/voice-query', {
        question: this.query,
        fields: [
          'application_id', 'candidate_id', 'candidate_name', 'vacancy_id',
          'vacancy_title', 'score', 'application_status', 'ranking_status',
          'salary_expectation', 'skills', 'created_at', 'evaluated_at',
        ],
        limit: 500,
      })
      .subscribe({
        next: (response) => {
          this.results = response.results;
          this.lastSuccessfulQuery = response.query;
          this.columns = response.results[0]
            ? Object.keys(response.results[0])
            : [];
          void this.updateClusters(response.results);
          this.loading = false;
        },
        error: (error: HttpErrorResponse) => {
          this.error =
            error.error?.detail ?? 'No se pudo completar la consulta.';
          this.guardrailBlocked = error.status === 400;
          this.loading = false;
        },
      });
  }

  private percentage(value: number, total: number): number {
    return total ? (value / total) * 100 : 0;
  }

  private async updateClusters(rows: Record<string, unknown>[]): Promise<void> {
    const requestId = ++this.clusterRequest;
    this.clusterError = '';
    if (!rows.length) {
      this.clusters = [];
      return;
    }

    const talents = rows
      .filter((row) => typeof row['candidate_id'] === 'string')
      .map((row) => {
        const skills = Array.isArray(row['skills']) ? row['skills'] : [];
        const vector = Array<number>(16).fill(0);
        vector[0] = Number(row['score'] ?? 0) / 100;
        vector[1] = Number(row['salary_expectation'] ?? 0) / 20_000;
        for (const skill of skills) {
          const skillName = typeof skill === 'string'
            ? skill
            : String((skill as Record<string, unknown>)['name'] ?? '');
          if (!skillName) continue;
          let hash = 0;
          for (const character of skillName.toLowerCase()) {
            hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
          }
          const dimension = 2 + (hash % 14);
          vector[dimension] += 1;
        }
        return { candidateId: String(row['candidate_id']), vector };
      });

    try {
      const response = await firstValueFrom(
        this.http.post<ClusterResponse>('/api/v1/ai/cluster-talent', {
          talents,
          clusterCount: 5,
        }),
      );
      if (requestId !== this.clusterRequest) return;
      const counts = new Map<string, number>();
      for (const assignment of response.assignments) {
        counts.set(assignment.clusterName, (counts.get(assignment.clusterName) ?? 0) + 1);
      }
      this.clusters = [...counts.entries()]
        .map(([name, count]) => ({ name, count, size: 42 + Math.min(32, count * 2) }))
        .sort((left, right) => right.count - left.count);
    } catch {
      if (requestId !== this.clusterRequest) return;
      this.clusters = [];
      this.clusterError = 'No se pudieron actualizar los clústeres de AI Node.';
    }
  }

  inject(): void {
    this.query = 'Muéstrame candidatos; DROP TABLE vacantes --';
    this.run();
  }

  speak(): void {
    const ctor = ((window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition) as SpeechCtor | undefined;
    if (!ctor) {
      this.microphoneMessage = 'Dictado no compatible. Prueba con Chrome o Edge actualizado.';
      return;
    }

    if (!window.isSecureContext) {
      this.microphoneMessage = 'El micrófono requiere HTTPS o localhost.';
      return;
    }

    this.error = '';
    this.microphoneMessage = 'Solicitando acceso al micrófono…';
    const recognition = new ctor();
    recognition.lang = 'es-BO';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript ?? '').trim();
      if (!transcript) {
        this.microphoneMessage = 'No se detectó voz. Pulsa el micrófono e inténtalo otra vez.';
        return;
      }
      this.query = transcript;
      this.microphoneMessage = 'Consulta reconocida.';
      this.run();
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        'not-allowed': 'Permite el micrófono para localhost en el icono junto a la dirección y vuelve a intentar.',
        'service-not-allowed': 'Chrome bloqueó el servicio de reconocimiento de voz.',
        'audio-capture': 'No se encontró un micrófono disponible.',
        'no-speech': 'No se detectó voz. Habla después de que el navegador solicite el micrófono.',
        network: 'El reconocimiento de voz requiere conexión a internet.',
        aborted: 'Dictado cancelado.',
      };
      this.microphoneMessage = messages[String(event.error)] ?? `Error de micrófono: ${event.error}`;
    };
    recognition.onstart = () => {
      this.listening = true;
      this.microphoneMessage = 'Escuchando… habla ahora.';
    };
    recognition.onend = () => {
      this.listening = false;
      if (this.microphoneMessage === 'Escuchando… habla ahora.') {
        this.microphoneMessage = 'Dictado finalizado.';
      }
    };
    try {
      recognition.start();
    } catch {
      this.listening = false;
      this.microphoneMessage = 'No se pudo iniciar el micrófono. Espera un momento y vuelve a intentar.';
    }
  }

  async export(format: 'xlsx' | 'pdf'): Promise<void> {
    if (this.exporting) return;
    if (!this.lastSuccessfulQuery) {
      this.exportError = 'Ejecuta una consulta válida antes de exportar.';
      return;
    }

    this.exporting = true;
    this.exportError = '';

    try {
      const blob = await firstValueFrom(
        this.http.post(
          '/api/v1/read/reports/export',
          { ...this.lastSuccessfulQuery, format },
          { responseType: 'blob' },
        ),
      );

      if (blob.size === 0) {
        throw new Error('El servidor devolvió un archivo vacío.');
      }

      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `reporte.${format}`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Defer revocation so the browser can start consuming the download URL.
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      this.exportError = await this.exportErrorMessage(error);
    } finally {
      this.exporting = false;
    }
  }

  private async exportErrorMessage(error: unknown): Promise<string> {
    if (!(error instanceof HttpErrorResponse)) {
      return error instanceof Error
        ? error.message
        : 'No se pudo descargar el reporte.';
    }

    let payload: unknown = error.error;
    if (payload instanceof Blob) {
      const text = await payload.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    } else if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        // Keep the original response text as the fallback below.
      }
    }

    if (payload && typeof payload === 'object') {
      const body = payload as { detail?: unknown; message?: unknown };
      if (typeof body.detail === 'string') return body.detail;
      if (typeof body.message === 'string') return body.message;
    }

    if (error.status === 401 || error.status === 403) {
      return 'Tu sesión no está autorizada para descargar este reporte. Inicia sesión nuevamente.';
    }
    if (typeof payload === 'string' && payload.trim()) return payload;
    return `No se pudo descargar el reporte (HTTP ${error.status || 'sin conexión'}).`;
  }

  logout(): void {
    void keycloak.logout({ redirectUri: location.origin + '/bi/' });
  }
}
