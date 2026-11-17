import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { requireCandidateSession } from './services/auth';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) throw new Error('No se encontró el contenedor de la aplicación');

requireCandidateSession().then(isCandidate => {
  if (isCandidate) createApp(App).mount(root);
}).catch(error => {
  root.textContent = `No fue posible iniciar sesión: ${String(error)}`;
});

if('serviceWorker'in navigator)navigator.serviceWorker.register('/portal/sw.js',{scope:'/portal/'});
