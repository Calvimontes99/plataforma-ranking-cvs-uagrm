import { useLazyQuery, useQuery } from '@apollo/client';
import { useState } from 'react';
import { CANDIDATES, postJson, VACANCIES } from './api/client';
import { keycloak } from './auth/keycloak';

type Vacancy = { id:string; titulo:string; cupoDisponible:number; estado:string };
type Candidate = { candidatoId:string; nombreCompleto:string; puntajeRanking:number; pretensionSalarial?:number };
type SagaStep = { name:string; state:'pending'|'running'|'done'|'compensated'|'failed' };

export function App() {
  // Vista por actor: usa los roles del token y, si el token no los trae, el nombre de usuario.
  const token = (keycloak.tokenParsed ?? {}) as { preferred_username?: string; realm_access?: { roles?: string[] } };
  const roles = token.realm_access?.roles ?? [];
  const username = (token.preferred_username ?? '').toLowerCase();
  const isDocente = username.startsWith('docente') || (roles.includes('AI_AGENT') && !roles.includes('RRHH'));
  const isAi = isDocente;
  const isRrhh = !isDocente;
  // Cada actor tiene su propia ruta: /erp/rrhh o /erp/ia.
  const route = isDocente ? '/erp/ia' : '/erp/rrhh';
  if (location.pathname !== route) history.replaceState(null, '', route);
  const vacancies = useQuery<{vacantesAbiertas:Vacancy[]}>(VACANCIES, { skip: !isRrhh });
  const [loadCandidates, candidates] = useLazyQuery<{postulantesPreaprobados:Candidate[]}>(CANDIDATES);
  const [selectedVacancy, setSelectedVacancy] = useState('');
  const [candidate, setCandidate] = useState<Candidate>();
  const [steps, setSteps] = useState<SagaStep[]>([]);
  const [mission, setMission] = useState('Monitorea las vacantes críticas que llevan más de 15 días sin cubrirse y presenta una terna de candidatos viables');
  const [missionResult, setMissionResult] = useState<any>();
  const [busy, setBusy] = useState(false);

  async function selectVacancy(id:string) { setSelectedVacancy(id); setCandidate(undefined); await loadCandidates({variables:{vacanteId:id}}); }
  async function runSaga(forceRollback=false) {
    if (!candidate || !selectedVacancy) return;
    setBusy(true); const idempotencyKey=crypto.randomUUID();
    setSteps([{name:'1 · Selección en DynamoDB',state:'running'},{name:'2 · Bloqueo en MongoDB',state:'pending'},{name:'3 · Contrato en PostgreSQL',state:'pending'}]);
    try {
      const response=await postJson<any>('/api/v1/ranking/sagas',{vacancyId:selectedVacancy,candidateId:candidate.candidatoId,reason:forceRollback?'PRUEBA_ROLLBACK_CUPO_AGOTADO':'CONTRATACION_ERP'},idempotencyKey);
      setSteps([{name:'1 · Selección en DynamoDB',state:'done'},{name:'2 · Bloqueo en MongoDB',state:'running'},{name:'3 · Contrato en PostgreSQL',state:forceRollback?'failed':'running'},...(forceRollback?[{name:'Compensación automática pasos 2 y 1',state:'compensated' as const}]:[])]);
      setMissionResult(response);
    } catch(error) { setSteps(current=>current.map((step,index)=>({...step,state:index===0?'failed':'compensated'}))); setMissionResult({error:String(error)}); }
    finally { setBusy(false); }
  }
  async function executeMission() { setBusy(true); try { setMissionResult(await postJson('/agents/execute-mission',{goal:mission,intent:'diagnose_vacancies',limit:20,context:{source:'erp-react'}})); } catch(e){setMissionResult({error:String(e)});} finally{setBusy(false);} }

  return <main>
    <header><div><small>RECRUITMENT OS · {token.preferred_username??'usuario'} · {isDocente?'Docente (IA)':'RRHH'}</small><h1>{isRrhh?'Centro de mando RRHH':'Centro de IA · Agentes'}</h1></div><nav><a href="/bi/">BI y reportes</a><a href="/portal/">Portal postulante</a><button onClick={()=>keycloak.logout({redirectUri:location.origin+'/layout/'})}>Salir</button></nav></header>
    {isRrhh&&<section className="hero"><div><span className="eyebrow">ERP · GraphQL selectivo</span><h2>Decisiones de talento, con trazabilidad completa.</h2><p>La tabla solicita únicamente los campos visibles. Sin payloads REST sobredimensionados.</p></div><div className="metric"><b>{vacancies.data?.vacantesAbiertas.length??0}</b><span>vacantes abiertas</span></div></section>}
    {isAi&&<section className="hero"><div><span className="eyebrow">IA · Agentes MCP</span><h2>Evaluación inteligente de candidatos.</h2><p>El agente revisa vacantes críticas, busca CVs afines en el histórico, recalcula el ranking con IA y propone una terna con agenda de entrevistas.</p></div><div className="metric"><b>3</b><span>herramientas MCP</span></div></section>}
    <div className="grid">
      {isRrhh&&<section className="card"><h3>Vacantes</h3>{vacancies.loading&&<p>Cargando…</p>}{vacancies.data?.vacantesAbiertas.map(v=><button className={`row ${selectedVacancy===v.id?'active':''}`} onClick={()=>selectVacancy(v.id)} key={v.id}><span><b>{v.titulo}</b><small>{v.estado}</small></span><strong>{v.cupoDisponible} cupos</strong></button>)}</section>}
      {isRrhh&&<section className="card wide"><div className="section-title"><div><h3>Terna preaprobada</h3><small>Campos GraphQL: id · nombreCompleto · puntajeRanking · pretensionSalarial</small></div></div>
        {!selectedVacancy?<p className="empty">Selecciona una vacante.</p>:candidates.data?.postulantesPreaprobados.map(c=><button className={`candidate ${candidate?.candidatoId===c.candidatoId?'active':''}`} onClick={()=>setCandidate(c)} key={c.candidatoId}><span>{c.nombreCompleto}</span><b>{c.puntajeRanking.toFixed(1)}%</b><span>Bs {c.pretensionSalarial?.toLocaleString()??'—'}</span></button>)}
        <div className="actions"><button disabled={!candidate||busy} onClick={()=>runSaga(false)}>Contratar candidato · Ejecutar SAGA</button><button className="danger" disabled={!candidate||busy} onClick={()=>runSaga(true)}>Forzar rollback (cupo 0)</button></div>
        {steps.map(s=><div className={`step ${s.state}`} key={s.name}><i></i><span>{s.name}</span><b>{s.state}</b></div>)}
      </section>}
      {isAi&&<section className="card agent wide"><span className="eyebrow">MCP HOST · AGENTES</span><h3>Misión inteligente</h3><textarea value={mission} onChange={e=>setMission(e.target.value)}/><button onClick={executeMission} disabled={busy}>Ejecutar misión</button><div className="skills"><span>diagnosticar_vacantes_criticas</span><span>buscar_candidatos_historicos_afines</span><span>recalcular_puntaje_candidatos</span></div>{missionResult&&<pre>{JSON.stringify(missionResult,null,2)}</pre>}</section>}
    </div>
  </main>;
}
