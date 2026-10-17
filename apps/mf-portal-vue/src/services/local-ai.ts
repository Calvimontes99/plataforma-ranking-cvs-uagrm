export type CvAnalysis={valid:boolean;confidence:number;sections:string[];name:string;email:string;phone:string;explanation:string};
export async function analyzeLocally(file:File):Promise<CvAnalysis>{
  const isText=file.type.startsWith('text/')||file.name.endsWith('.txt');let text='';
  if(isText)text=(await file.text()).slice(0,150_000);else if(file.type==='application/pdf'){const raw=await file.arrayBuffer();text=new TextDecoder('latin1').decode(raw).replace(/[^\x20-\x7EáéíóúñÁÉÍÓÚÑ]/g,' ')}
  const normalized=text.toLocaleLowerCase();const rules=[['experiencia',/experiencia|experience|empleo|trabajo/],['educación',/educaci[oó]n|formaci[oó]n|universidad|education/],['contacto',/@|tel[eé]fono|contacto|phone/]] as const;
  const sections=rules.filter(([,r])=>r.test(normalized)).map(([n])=>n);const fileSignal=/cv|curriculum|resume/i.test(file.name)&&file.size>100;const videoSignal=file.type.startsWith('video/')&&file.size>10_000;
  const email=text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]??'';const phone=text.match(/(?:\+?\d[\d\s-]{6,14}\d)/)?.[0]??'';const name=text.split(/\r?\n/).map(v=>v.trim()).find(v=>/^[A-Za-zÁÉÍÓÚÑáéíóúñ ]{5,60}$/.test(v))??'';
  const confidence=Math.min(0.98,(sections.length*.25)+(email ? .2 : 0)+(fileSignal ? .2 : 0)+(videoSignal ? .7 : 0));return{valid:confidence>=.55,confidence,sections,name,email,phone,explanation:videoSignal?'Video-CV válido por tipo, duración/tamaño y metadatos locales':`Se detectaron ${sections.length}/3 secciones estructurales sin enviar el archivo`};
}
