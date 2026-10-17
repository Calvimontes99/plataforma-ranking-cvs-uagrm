import React from 'react';
import ReactDOM from 'react-dom/client';
import { ApolloProvider } from '@apollo/client';
import { client } from './api/client';
import { initializeSso } from './auth/keycloak';
import { App } from './App';
import './styles.css';

initializeSso().then(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ApolloProvider client={client}><App /></ApolloProvider></React.StrictMode>,
)).catch(error => { document.getElementById('root')!.textContent = `SSO no disponible: ${String(error)}`; });
