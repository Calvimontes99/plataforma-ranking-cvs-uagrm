import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { authInterceptor, initializeSso } from './app/core/auth';

initializeSso().then(()=>bootstrapApplication(AppComponent,{providers:[provideHttpClient(withInterceptors([authInterceptor]))]})).catch(console.error);
