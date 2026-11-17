import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, Subject } from 'rxjs';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { DeviceTokenRecord } from '../../out/persistence/schemas';

export interface PlatformEvent {
  type: string;
  aggregateId?: string;
  occurredAt: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly events = new Subject<PlatformEvent>();
  private firebaseApp?: App;

  constructor(@InjectModel(DeviceTokenRecord.name) private readonly devices: Model<DeviceTokenRecord>) {}

  onModuleInit(): void {
    if (getApps().length) {
      this.firebaseApp = getApps()[0];
      return;
    }
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.K_SERVICE) {
      this.logger.warn('FCM deshabilitado; configura FIREBASE_SERVICE_ACCOUNT_JSON o Google Application Default Credentials');
      return;
    }
    try {
      this.firebaseApp = serviceAccountJson
        ? initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) })
        : initializeApp(); // Application Default Credentials via GOOGLE_APPLICATION_CREDENTIALS.
      this.logger.log('Firebase Admin listo para FCM');
    } catch (error) {
      this.logger.warn(`FCM deshabilitado; configura credenciales Firebase Admin: ${this.message(error)}`);
    }
  }

  stream(): Observable<PlatformEvent> {
    return this.events.asObservable();
  }

  async registerToken(token: string, platform: string, userId?: string): Promise<void> {
    await this.devices.updateOne(
      { token },
      { $set: { token, platform, active: true, ...(userId ? { userId } : {}) } },
      { upsert: true, runValidators: true },
    ).exec();
  }

  async publish(event: PlatformEvent): Promise<void> {
    this.events.next(event);
    if (!this.firebaseApp) return;
    try {
      const devices = await this.devices.find({ active: true }).select({ token: 1, _id: 0 }).lean().exec();
      const tokens = devices.map((device) => device.token).filter(Boolean);
      for (let offset = 0; offset < tokens.length; offset += 500) {
        const notification = this.notificationFor(event);
        const message: MulticastMessage = {
          tokens: tokens.slice(offset, offset + 500),
          notification,
          data: {
            type: event.type,
            aggregateId: event.aggregateId ?? '',
            occurredAt: event.occurredAt,
            title: notification.title,
            body: notification.body,
          },
          android: { priority: 'high' },
        };
        const result = await getMessaging(this.firebaseApp).sendEachForMulticast(message);
        const staleTokens = result.responses.flatMap((response, index) => {
          const code = response.error?.code;
          return !response.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')
            ? [tokens[offset + index]] : [];
        });
        if (staleTokens.length) await this.devices.deleteMany({ token: { $in: staleTokens } }).exec();
      }
    } catch (error) {
      this.logger.error(`No se pudo enviar FCM para ${event.type}: ${this.message(error)}`);
    }
  }

  private notificationFor(event: PlatformEvent): { title: string; body: string } {
    if (event.type === 'cv.ingested') {
      return { title: 'Sincronización móvil recibida', body: 'Un CV capturado en campo ya está disponible en el ERP.' };
    }
    if (event.type.includes('preapproved') || event.type.includes('Preapproved')) {
      return { title: 'Candidato preaprobado', body: 'El ranking detectó un candidato que supera el umbral de preaprobación.' };
    }
    if (event.type.toLowerCase().includes('vacancy')) {
      return { title: 'Actualización de vacante', body: 'Se registró un cambio en una vacante del proceso.' };
    }
    return { title: 'Actualización de reclutamiento', body: 'Hay una nueva actualización en el proceso de selección.' };
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
