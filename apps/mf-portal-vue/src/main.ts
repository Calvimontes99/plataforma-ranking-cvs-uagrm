import {createApp} from 'vue';import App from './App.vue';import './style.css';import {restoreSharedSession} from './services/auth';
restoreSharedSession().catch(()=>undefined).finally(()=>createApp(App).mount('#app'));
if('serviceWorker'in navigator)navigator.serviceWorker.register('/portal/sw.js',{scope:'/portal/'});
