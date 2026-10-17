import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { keycloak } from './core/auth';

type ReportResponse={count:number;results:Record<string,unknown>[];query:unknown};
type SpeechCtor=new()=>{lang:string;continuous:boolean;interimResults:boolean;start():void;onresult:(event:any)=>void;onerror:(event:any)=>void};

@Component({selector:'app-root',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./app.component.html'})
export class AppComponent{
  private http=inject(HttpClient); query='Muéstrame los candidatos al cargo de Ingeniero de Sistemas con puntaje mayor a 80 y pretensión salarial menor a 9000'; results:Record<string,unknown>[]=[]; columns:string[]=[]; error=''; guardrailBlocked=false; loading=false;
  funnel=[{label:'Postulaciones',value:248},{label:'Evaluados',value:184},{label:'Preaprobados',value:62},{label:'Seleccionados',value:18}]; clusters=[42,31,58,24,49];
  run(){this.loading=true;this.error='';this.guardrailBlocked=false;this.http.post<ReportResponse>('/api/v1/read/reports/voice-query',{question:this.query}).subscribe({next:r=>{this.results=r.results;this.columns=r.results[0]?Object.keys(r.results[0]):[];this.loading=false},error:e=>{this.error=e.error?.detail??'Consulta rechazada';this.guardrailBlocked=e.status===400;this.loading=false}})}
  inject(){this.query='Muéstrame candidatos; DROP TABLE vacantes --';this.run()}
  speak(){const Ctor=((window as any).SpeechRecognition||(window as any).webkitSpeechRecognition) as SpeechCtor|undefined;if(!Ctor){this.error='Web Speech API no está disponible en este navegador';return}const recognition=new Ctor();recognition.lang='es-BO';recognition.continuous=false;recognition.interimResults=false;recognition.onresult=e=>{this.query=e.results[0][0].transcript;this.run()};recognition.onerror=e=>this.error=`Micrófono: ${e.error}`;recognition.start()}
  export(format:'xlsx'|'pdf'){this.http.post('/api/v1/read/reports/export',{question:this.query,format},{responseType:'blob'}).subscribe(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`reporte.${format}`;a.click();URL.revokeObjectURL(a.href)})}
  logout(){void keycloak.logout({redirectUri:location.origin+'/bi/'})}
}
