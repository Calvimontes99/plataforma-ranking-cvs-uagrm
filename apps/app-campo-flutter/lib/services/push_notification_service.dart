import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Must be a top-level function so the Flutter engine can invoke it in the
/// background isolate. Do not perform UI or database work here.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // FCM notification payloads are displayed by Android while backgrounded.
  // Show data-only pushes as well so n8n can send either payload style.
  if (message.notification == null) {
    final plugin = FlutterLocalNotificationsPlugin();
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    await plugin.initialize(const InitializationSettings(android: android));
    const channel = AndroidNotificationChannel(
      'recruitment_alerts',
      'Alertas de reclutamiento',
      description: 'Sincronizaciones y vacantes prioritarias',
      importance: Importance.high,
    );
    await plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
    await plugin.show(
      message.hashCode,
      message.data['title']?.toString() ?? 'Alerta de reclutamiento',
      message.data['body']?.toString() ?? 'Tienes una nueva actualización.',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'recruitment_alerts',
          'Alertas de reclutamiento',
          channelDescription: 'Sincronizaciones y vacantes prioritarias',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }
}

class PushNotificationService {
  PushNotificationService._();

  static final PushNotificationService instance = PushNotificationService._();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'recruitment_alerts',
    'Alertas de reclutamiento',
    description: 'Sincronizaciones y vacantes prioritarias',
    importance: Importance.high,
  );

  bool _initialized = false;

  /// Initialize after Firebase.initializeApp(). Safe to call once at startup.
  Future<void> initialize() async {
    if (_initialized) return;

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: androidSettings);
    await _localNotifications.initialize(
      settings,
      onDidReceiveNotificationResponse: _onLocalNotificationTap,
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    // Android 13+ notification runtime permission. iOS permission requests are
    // handled too if this app gains an iOS Firebase configuration later.
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    FirebaseMessaging.onMessage.listen(_showForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleOpenedMessage);
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) _handleOpenedMessage(initialMessage);

    _initialized = true;
  }

  /// FCM registration token for the current installation/device.
  Future<String?> getToken() => _messaging.getToken();

  /// Listen for token rotation and forward new values to the caller/backend.
  Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  Future<void> _showForegroundMessage(RemoteMessage message) async {
    final notification = message.notification;
    final title = notification?.title ?? message.data['title']?.toString();
    final body = notification?.body ?? message.data['body']?.toString();
    if (title == null && body == null) return;

    await _localNotifications.show(
      message.hashCode,
      title ?? 'Alerta de reclutamiento',
      body ?? '',
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      payload: jsonEncode(message.data),
    );
  }

  void _handleOpenedMessage(RemoteMessage message) {
    // Route based on message.data (e.g. type=priority_vacancy) when the app
    // adds named routes. For now the payload remains available to the app.
    debugPrint('FCM opened: ${message.data}');
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    debugPrint('Local notification tapped: ${response.payload}');
  }
}
