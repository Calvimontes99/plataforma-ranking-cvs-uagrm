import Keycloak from 'keycloak-js';
import { HttpInterceptorFn } from '@angular/common/http';
export const keycloak=new Keycloak({url:`${location.origin}/auth`,realm:'recruitment',clientId:'erp-web'});
export const initializeSso=()=>keycloak.init({onLoad:'login-required',pkceMethod:'S256',checkLoginIframe:false});
export const authInterceptor:HttpInterceptorFn=(request,next)=>next(keycloak.token?request.clone({setHeaders:{Authorization:`Bearer ${keycloak.token}`}}):request);
