import { readFile } from 'node:fs/promises';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const token = process.env.FCM_TEST_TOKEN?.trim();
if (!token) {
  throw new Error('Define FCM_TEST_TOKEN con el token del Honor antes de ejecutar.');
}

const credentialUrl = new URL('./service-account.json', import.meta.url);
const serviceAccount = JSON.parse(await readFile(credentialUrl, 'utf8'));

const app = getApps()[0] ?? initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const messageId = await getMessaging(app).send({
  token,
  notification: {
    title: 'Prueba UAGRM',
    body: 'Notificación desde el backend',
  },
  data: {
    type: 'fcm_test',
  },
  android: {
    priority: 'high',
    notification: {
      channelId: 'recruitment_alerts',
      visibility: 'public',
      sound: 'default',
    },
  },
});

console.log(`FCM aceptó el mensaje. ID: ${messageId}`);
