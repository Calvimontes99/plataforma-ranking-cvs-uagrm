import { useLazyQuery, useQuery } from '@apollo/client';
import { useEffect, useState } from 'react';
import { CANDIDATES, postJson, VACANCIES, watchPlatformEvents } from './api/client';
import { keycloak } from './auth/keycloak';

type Vacancy = { id:string; titulo:string; cupoDisponible:number; estado:string };
type Candidate = { candidatoId:string; nombreCompleto:string; puntajeRanking:number; pretensionSalarial?:number };
type SagaStep = { name:string; state:'pending'|'running'|'done'|'compensated'|'failed' };

const CANDIDATE_NAMES: Record<string, string> = {
  '22222222-2222-4222-8222-000000000001': 'Ana Sofía Vargas',
  '22222222-2222-4222-8222-000000000002': 'Luis Fernando Rojas',
  '22222222-2222-4222-8222-000000000003': 'Camila Andrea Flores',
  '22222222-2222-4222-8222-000000000004': 'Diego Alejandro Quispe',
  '22222222-2222-4222-8222-000000000005': 'Valeria Paz Mendoza',
  '22222222-2222-4222-8222-000000000006': 'Jorge Nicolás Salazar',
  '22222222-2222-4222-8222-000000000007': 'Mariana Belén Choque',
  '22222222-2222-4222-8222-000000000008': 'Pablo Andrés Céspedes',
};

const STEP_LABELS: Record<string, string> = {
  'vacancy-context': '1 · Diagnóstico de vacantes críticas (ms-vacantes)',
  'historical-candidate-search': '2 · Búsqueda de CVs históricos afines (ms-ingesta)',
  'candidate-ranking': '3 · Evaluación y ranking con IA (ms-ranking)',
  'audited-action-plan': '4 · Plan de acción y agenda de entrevistas (ai-node)',
};

function candidateName(id?: string, fallbackList?: any[]): string {
  if (!id) return 'Candidato';
  if (CANDIDATE_NAMES[id]) return CANDIDATE_NAMES[id];
  const found = fallbackList?.find((c: any) => (c?.applicant?.candidateId ?? c?.candidateId) === id);
  if (found?.applicant?.name) return found.applicant.name;
  return `Candidato ${id.slice(0, 8)}`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export function App() {
  const token = (keycloak.tokenParsed ?? {}) as { preferred_username?: string; realm_access?: { roles?: string[] } };
  const roles = token.realm_access?.roles ?? [];
  const username = (token.preferred_username ?? '').toLowerCase();
  const isDocente = roles.includes('AI_AGENT') && !roles.includes('RRHH') && !roles.includes('ADMIN');
  const isAi = isDocente;
  const isRrhh = !isDocente;
  const route = isDocente ? '/erp/ia' : '/erp/rrhh';
  if (location.pathname !== route) history.replaceState(null, '', route);
  const vacancies = useQuery<{vacantesAbiertas:Vacancy[]}>(VACANCIES, { skip: !isRrhh });
  const [loadCandidates, candidates] = useLazyQuery<{postulantesPreaprobados:Candidate[]}>(CANDIDATES);
  const [selectedVacancy, setSelectedVacancy] = useState('');
  const [candidate, setCandidate] = useState<Candidate>();
  const [steps, setSteps] = useState<SagaStep[]>([]);
  const [mission, setMission] = useState('Monitorea las vacantes críticas que llevan más de 15 días sin cubrirse y presenta una terna de candidatos viables');
  const [missionResult, setMissionResult] = useState<any>();
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isRrhh) return;
    const controller = new AbortController();
    void watchPlatformEvents(() => {
      void vacancies.refetch();
      if (selectedVacancy && candidates.called) {
        void loadCandidates({ variables: { vacanteId: selectedVacancy }, fetchPolicy: 'network-only' });
      }
    }, controller.signal);
    return () => controller.abort();
  }, [isRrhh, selectedVacancy, candidates.called, vacancies.refetch, loadCandidates]);
  const [screeningSkills, setScreeningSkills] = useState('Python, FastAPI, SQL');
  const [screeningExperience, setScreeningExperience] = useState('6');
  const [screeningScore, setScreeningScore] = useState('92');
  const [screeningBusy, setScreeningBusy] = useState(false);
  const [screeningResult, setScreeningResult] = useState<any>();

  async function selectVacancy(id:string) { setSelectedVacancy(id); setCandidate(undefined); setSteps([]); setMissionResult(undefined); setShowJson(false); await loadCandidates({variables:{vacanteId:id}}); }
  async function runSaga(forceRollback=false) {
    if (!candidate || !selectedVacancy) return;
    const vac = vacancies.data?.vacantesAbiertas.find(v=>v.id===selectedVacancy);
    const willRollback = forceRollback || (vac !== undefined && vac.cupoDisponible <= 0);
    setBusy(true); setShowJson(false); const idempotencyKey=crypto.randomUUID();
    setSteps([{name:'1 · Selección en DynamoDB',state:'running'},{name:'2 · Bloqueo en MongoDB',state:'pending'},{name:'3 · Contrato en PostgreSQL',state:'pending'}]);
    try {
      const response=await postJson<any>('/api/v1/ranking/sagas',{vacancyId:selectedVacancy,candidateId:candidate.candidatoId,reason:willRollback?'PRUEBA_ROLLBACK_CUPO_AGOTADO':'CONTRATACION_ERP'},idempotencyKey);
      if (willRollback) {
        setSteps([{name:'1 · Selección en DynamoDB',state:'compensated'},{name:'2 · Bloqueo en MongoDB',state:'compensated'},{name:'3 · Contrato en PostgreSQL (Cupo 0)',state:'failed'},{name:'Compensación automática pasos 2 y 1',state:'compensated'}]);
      } else {
        setSteps([{name:'1 · Selección en DynamoDB',state:'done'},{name:'2 · Bloqueo en MongoDB',state:'done'},{name:'3 · Contrato en PostgreSQL',state:'done'}]);
      }
      setMissionResult(response);
      setTimeout(()=>void vacancies.refetch(), 1200);
    } catch(error) { setSteps(current=>current.map((step,index)=>({...step,state:index===0?'failed':'compensated'}))); setMissionResult({error:String(error)}); }
    finally { setBusy(false); }
  }
  async function executeMission() {
    setBusy(true); setShowJson(false);
    try {
      setMissionResult(await postJson('/agents/execute-mission',{goal:mission,intent:'diagnose_vacancies',limit:20,context:{source:'erp-react'}}));
    } catch(e) {
      setMissionResult({error:String(e)});
    } finally {
      setBusy(false);
    }
  }

  async function screenCandidate() {
    setScreeningBusy(true);
    try {
      setScreeningResult(await postJson('/api/v1/agents/screen-candidate', {
        skills: screeningSkills.split(',').map(skill => skill.trim()).filter(Boolean),
        experienceYears: Number(screeningExperience),
        compatibilityScore: Number(screeningScore),
      }));
    } catch (error) {
      setScreeningResult({ error: String(error) });
    } finally {
      setScreeningBusy(false);
    }
  }

  const criticalVacancies: any[] = missionResult?.steps?.[0]?.result?.vacantesCriticas ?? [];
  const discoveredCvs: any[] = missionResult?.steps?.[1]?.result?.candidates ?? [];
  const shortlist: any[] = missionResult?.candidateShortlist ?? [];
  const interviews: any[] = missionResult?.interviewPreSchedule ?? [];
  const actionPlan: string[] = missionResult?.steps?.[3]?.plan ?? [];
  const auditInfo = missionResult?.steps?.[3]?.audit;

  return <main>
    <header><div><small>RECRUITMENT OS · {token.preferred_username??'usuario'} · {isDocente?'Docente (IA)':'RRHH'}</small><h1>{isRrhh?'Centro de mando RRHH':'Centro de IA · Agentes'}</h1></div><nav><a href="/bi/">BI y reportes</a><a href="/portal/?switch-account=1">Portal postulante</a><button onClick={()=>keycloak.logout({redirectUri:location.origin+'/layout/'})}>Salir</button></nav></header>
    {isRrhh&&<section className="hero"><div><span className="eyebrow">ERP · GraphQL selectivo</span><h2>Decisiones de talento, con trazabilidad completa.</h2><p>La tabla solicita únicamente los campos visibles. Sin payloads REST sobredimensionados.</p></div><div className="metric"><b>{vacancies.data?.vacantesAbiertas.length??0}</b><span>vacantes abiertas</span></div></section>}
    {isAi&&<section className="hero"><div><span className="eyebrow">IA · Agentes MCP</span><h2>Evaluación inteligente de candidatos.</h2><p>El agente revisa vacantes críticas, busca CVs afines en el histórico, recalcula el ranking con IA y propone una terna con agenda de entrevistas.</p></div><div className="metric"><b>3</b><span>herramientas MCP</span></div></section>}
    <div className="grid">
      {isRrhh&&<section className="card"><h3>Vacantes</h3>{vacancies.loading&&<p>Cargando…</p>}{vacancies.data?.vacantesAbiertas.map(v=><button className={`row ${selectedVacancy===v.id?'active':''}`} onClick={()=>selectVacancy(v.id)} key={v.id}><span><b>{v.titulo}</b><small>{v.estado}</small></span><strong>{v.cupoDisponible} cupos</strong></button>)}</section>}
      {isRrhh&&<section className="card wide"><div className="section-title"><div><h3>Terna preaprobada</h3><small>Campos GraphQL: id · nombreCompleto · puntajeRanking · pretensionSalarial</small></div></div>
        {!selectedVacancy?<p className="empty">Selecciona una vacante.</p>:candidates.data?.postulantesPreaprobados.map(c=><button className={`candidate ${candidate?.candidatoId===c.candidatoId?'active':''}`} onClick={()=>setCandidate(c)} key={c.candidatoId}><span>{c.nombreCompleto}</span><b>{c.puntajeRanking.toFixed(1)}%</b><span>Bs {c.pretensionSalarial?.toLocaleString()??'—'}</span></button>)}
        <div className="actions"><button disabled={!candidate||busy} onClick={()=>runSaga(false)}>Contratar candidato · Ejecutar SAGA</button><button className="danger" disabled={!candidate||busy} onClick={()=>runSaga(true)}>Forzar rollback (cupo 0)</button></div>
        {steps.map(s=><div className={`step ${s.state}`} key={s.name}><i></i><span>{s.name}</span><b>{s.state}</b></div>)}
        {missionResult&&<div className="result-panel light">
          <div className="result-header">
            <div>
              <strong>{missionResult.error ? 'Operación rechazada / compensada' : `SAGA iniciada · Folio ${String(missionResult.sagaId ?? '').slice(0, 8)}`}</strong>
              <small>{missionResult.error ? missionResult.error : `Candidato: ${candidateName(missionResult.candidateId)} · Estado inicial: ${missionResult.status}`}</small>
            </div>
            <button type="button" className="btn-json" onClick={()=>setShowJson(v=>!v)}>{showJson ? 'Ocultar JSON' : 'Ver JSON'}</button>
          </div>
          {showJson&&<pre>{JSON.stringify(missionResult,null,2)}</pre>}
        </div>}
      </section>}
      {isAi&&<section className="card agent wide">
        <span className="eyebrow">MCP HOST · AGENTES</span>
        <h3>Misión inteligente</h3>
        <textarea value={mission} onChange={e=>setMission(e.target.value)}/>
        <button onClick={executeMission} disabled={busy}>{busy ? 'Ejecutando misión…' : 'Ejecutar misión'}</button>
        <div className="skills"><span>diagnosticar_vacantes_criticas</span><span>buscar_candidatos_historicos_afines</span><span>recalcular_puntaje_candidatos</span></div>
        {missionResult&&<div className="mission-report">
          <div className="result-header">
            <div>
              <span className={`badge ${missionResult.status === 'completed' ? 'ok' : 'warn'}`}>
                {missionResult.status === 'completed' ? '✓ Misión completada' : '⚠ Ejecución parcial'}
              </span>
              <h4>Reporte ejecutivo para Recursos Humanos</h4>
            </div>
            <button type="button" className="btn-json" onClick={()=>setShowJson(v=>!v)}>{showJson ? 'Ocultar JSON' : 'Ver JSON'}</button>
          </div>

          <div className={`mission-body ${showJson ? 'with-json' : ''}`}>
            <div className="mission-client-view">
              <div className="report-grid">
                <div className="report-box">
                  <h5>1. Vacantes críticas detectadas ({criticalVacancies.length})</h5>
                  {criticalVacancies.length === 0 ? <p className="muted">No se recibieron vacantes críticas.</p> : criticalVacancies.map((v: any) => (
                    <div className="report-item" key={v.vacanteId}>
                      <div>
                        <b>{v.titulo}</b>
                        <small>Habilidades: {(v.requiredSkills ?? []).join(', ')}</small>
                      </div>
                      <span className="pill">{v.cuposDisponibles} cupos</span>
                    </div>
                  ))}
                </div>

                <div className="report-box">
                  <h5>2. Terna de candidatos viables ({shortlist.length})</h5>
                  {shortlist.length === 0 ? <p className="muted">Sin candidatos evaluados en esta corrida.</p> : shortlist.map((c: any, idx: number) => (
                    <div className="report-item" key={c.candidateId ?? idx}>
                      <div>
                        <b>#{c.position ?? idx + 1} · {candidateName(c.candidateId, discoveredCvs)}</b>
                        <small>Expediente CV: {String(c.resumeId ?? '').slice(0, 8)}…</small>
                      </div>
                      <span className="pill score">{Number(c.score ?? 0).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>

                <div className="report-box">
                  <h5>3. Agenda tentativa de entrevistas ({interviews.length})</h5>
                  {interviews.length === 0 ? <p className="muted">No hay entrevistas programadas.</p> : interviews.map((slot: any, idx: number) => (
                    <div className="report-item" key={slot.candidateId ?? idx}>
                      <div>
                        <b>{candidateName(slot.candidateId, discoveredCvs)}</b>
                        <small>{formatDate(slot.proposedAt)} · Duración: {slot.durationMinutes} min</small>
                      </div>
                      <span className="pill">Por confirmar</span>
                    </div>
                  ))}
                </div>

                <div className="report-box">
                  <h5>4. Trazabilidad de pasos y plan de acción</h5>
                  {(missionResult.steps ?? []).map((st: any) => (
                    <div className="report-step" key={st.sequence}>
                      <span className={st.ok ? 'ok-dot' : 'err-dot'}>●</span>
                      <span>{STEP_LABELS[st.skill] ?? st.skill}</span>
                      <b>{st.ok ? 'OK' : st.skipped ? 'Omitido' : 'Error'}</b>
                    </div>
                  ))}
                  {actionPlan.length > 0 && <ul className="plan-list">
                    {actionPlan.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>}
                  {auditInfo && <small className="audit-hash">Firma SHA-256: {String(auditInfo.missionSha256).slice(0, 24)}…</small>}
                </div>
              </div>
            </div>

            {showJson && <div className="mission-json-view">
              <h5>Respuesta técnica JSON (Protocolo MCP)</h5>
              <pre>{JSON.stringify(missionResult, null, 2)}</pre>
            </div>}
          </div>
        </div>}
      </section>}
      {isAi&&<section className="card agent wide screening-agent">
        <span className="eyebrow">AGENTE INDEPENDIENTE · SCREENING</span>
        <h3>Evaluación individual de postulación</h3>
        <p>Clasifica una candidatura por skills críticas, experiencia y puntaje de compatibilidad. Umbrales: Top Tier ≥ 85% y 5 años; Standard ≥ 60% y 2 años.</p>
        <div className="screening-form">
          <label>Skills (separadas por coma)<input value={screeningSkills} onChange={event => setScreeningSkills(event.target.value)} /></label>
          <label>Años de experiencia<input type="number" min="0" max="80" step="0.5" value={screeningExperience} onChange={event => setScreeningExperience(event.target.value)} /></label>
          <label>Compatibilidad (%)<input type="number" min="0" max="100" step="1" value={screeningScore} onChange={event => setScreeningScore(event.target.value)} /></label>
        </div>
        <button onClick={screenCandidate} disabled={screeningBusy}>{screeningBusy ? 'Evaluando…' : 'Ejecutar CandidateScreeningAgent'}</button>
        {screeningResult&&<div className="screening-result" aria-live="polite">
          <div><span className={`badge ${screeningResult.category === 'Top Tier' ? 'ok' : screeningResult.category === 'Rechazado' || screeningResult.error ? 'warn' : ''}`}>{screeningResult.category ?? 'Error'}</span>
            <p>{screeningResult.recommendation ?? screeningResult.error}</p>
            {screeningResult.analysis&&<small>Skills críticas: {screeningResult.analysis.matchedCriticalSkills.join(', ') || 'ninguna'} · Experiencia: {screeningResult.analysis.experienceYears} años · Compatibilidad: {screeningResult.analysis.compatibilityScore}%</small>}
          </div>
          <button type="button" className="btn-json" onClick={()=>setShowJson(value=>!value)}>{showJson ? 'Ocultar JSON' : 'Ver JSON'}</button>
          {showJson&&<pre>{JSON.stringify(screeningResult,null,2)}</pre>}
        </div>}
      </section>}
    </div>
  </main>;
}
