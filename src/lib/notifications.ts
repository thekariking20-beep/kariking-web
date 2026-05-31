import { getToken, onMessage, type MessagePayload } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, getMessagingInstance, messaging } from '../firebase';
import { Capacitor } from '@capacitor/core';

// ─── VAPID Key (from Firebase Console → Cloud Messaging → Web Push certificates) ─
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

/**
 * Detect if running inside a Capacitor native app (Android/iOS).
 */
function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

// ─── NATIVE PUSH (Capacitor — Android/iOS) ──────────────────────────────────

/**
 * Register native push notifications via @capacitor/push-notifications.
 * This uses FCM natively on Android — works even when app is killed.
 */
async function registerNativePush(uid: string): Promise<void> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    
    // Check current permission status
    let permStatus = await PushNotifications.checkPermissions();
    
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    
    if (permStatus.receive !== 'granted') {
      console.warn('Native push permission not granted');
      return;
    }

    // Remove old listeners to prevent duplicates
    await PushNotifications.removeAllListeners();

    // Listen for registration success → save token to Firestore
    PushNotifications.addListener('registration', async (token) => {
      console.log('✅ Native FCM token:', token.value.substring(0, 20) + '...');
      try {
        await updateDoc(doc(db, 'users', uid), { fcmToken: token.value });
        console.log('✅ Native FCM token saved to Firestore');
      } catch (err) {
        console.error('Error saving native FCM token:', err);
      }
    });

    // Listen for registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Native push registration error:', error);
    });

    // Listen for foreground push notifications
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('📩 Native foreground notification:', notification);
      // Foreground notifications are handled by the NotificationToast component
      // via the onForegroundMessage listener. Native foreground notifications
      // are automatically shown by the system on Android.
    });

    // Listen for notification taps (when user clicks notification)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('🔔 Notification tapped:', action);
      const data = action.notification.data;
      if (data?.type) {
        const adminTypes = ['new_order', 'utr_submitted', 'kyc_request', 'bulk_booking_new', 'bulk_booking_paid', 'delivery_assignment', 'withdrawal_request'];
        if (adminTypes.includes(data.type)) {
          window.location.href = '/admin';
        } else {
          window.location.href = '/orders';
        }
      }
    });

    // Register with FCM
    await PushNotifications.register();
    console.log('✅ Native push notifications registered');
  } catch (err) {
    console.error('Failed to register native push:', err);
  }
}

// ─── WEB PUSH (Browser — Chrome/Firefox/Edge) ──────────────────────────────

/**
 * Request notification permission from the user (web browser).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications.');
      return false;
    }

    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return false;
  }
}

/**
 * Get FCM token for this device (web browser only).
 * Uses getMessagingInstance() to await async initialization.
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    const msg = await getMessagingInstance();
    if (!msg) {
      console.warn('Firebase Messaging not supported in this browser.');
      return null;
    }

    const permission = await requestNotificationPermission();
    if (!permission) return null;

    // Register service worker
    let swRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    }

    const token = await getToken(msg, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    return token || null;
  } catch (err) {
    console.error('Error getting FCM token:', err);
    return null;
  }
}

/**
 * Save FCM token to Firestore user document.
 */
export async function saveFCMToken(uid: string, token: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), { fcmToken: token });
  } catch (err) {
    console.error('Error saving FCM token:', err);
  }
}

// ─── UNIFIED REGISTRATION ───────────────────────────────────────────────────

/**
 * Register push notifications — automatically picks native (Android) or web (browser).
 * 
 * - On Android APK: Uses @capacitor/push-notifications (native FCM)
 * - On Web browser: Uses Firebase JS SDK (web push via service worker)
 * 
 * This is the only function that should be called from AuthContext.
 */
export async function registerPushNotifications(uid: string): Promise<void> {
  if (isNativePlatform()) {
    // ─── NATIVE (Android APK) ─────────────────────────────────────────
    console.log('📱 Registering native push notifications...');
    await registerNativePush(uid);
  } else {
    // ─── WEB (Browser) ────────────────────────────────────────────────
    console.log('🌐 Registering web push notifications...');
    const attempt = async (): Promise<boolean> => {
      try {
        const token = await getFCMToken();
        if (token) {
          await saveFCMToken(uid, token);
          console.log('✅ Web FCM token registered');
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to register web push notifications:', err);
        return false;
      }
    };

    const success = await attempt();
    if (!success) {
      // Retry once after 2 seconds
      await new Promise(r => setTimeout(r, 2000));
      await attempt();
    }
  }
}

// ─── FOREGROUND MESSAGE LISTENER ────────────────────────────────────────────

/**
 * Listen for foreground messages (web browser only).
 * On native, foreground notifications are handled by the native plugin.
 */
export function onForegroundMessage(
  callback: (payload: MessagePayload) => void
): (() => void) | null {
  // On native platform, foreground messages are handled by native plugin listeners
  if (isNativePlatform()) {
    // Set up a native foreground listener that converts to MessagePayload format
    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          // Convert native notification to MessagePayload format for NotificationToast
          const payload: MessagePayload = {
            notification: {
              title: notification.title || 'Kari King',
              body: notification.body || '',
            },
            data: notification.data || {},
          } as MessagePayload;
          callback(payload);
        });
      } catch (err) {
        console.error('Error setting up native foreground listener:', err);
      }
    })();
    // Return a cleanup function
    return () => {
      import('@capacitor/push-notifications').then(({ PushNotifications }) => {
        PushNotifications.removeAllListeners();
      }).catch(() => {});
    };
  }

  // Web browser path
  if (!messaging) return null;
  const unsubscribe = onMessage(messaging, (payload) => {
    console.log('📩 Foreground notification:', payload);
    callback(payload);
  });
  return unsubscribe;
}

// ─── UTILITIES ──────────────────────────────────────────────────────────────

/**
 * Get notification details for an order status.
 */
export function getOrderNotification(status: string, orderId?: string): { title: string; body: string } {
  const id = orderId ? ` #${orderId.slice(-6).toUpperCase()}` : '';
  
  switch (status) {
    case 'Order Placed':
      return { title: '🛒 Order Confirmed!', body: `Your order${id} has been received` };
    case 'Order Received':
      return { title: '✅ Order Accepted', body: `We're preparing your order${id}` };
    case 'Packed':
      return { title: '📦 Order Packed', body: `Your order${id} is ready for pickup` };
    case 'Dispatched':
      return { title: '🚚 Out for Delivery', body: `Your order${id} is on the way!` };
    case 'Delivered':
      return { title: '🎉 Order Delivered', body: `Your order${id} has been delivered. Enjoy!` };
    case 'Cancelled':
      return { title: '❌ Order Cancelled', body: `Your order${id} has been cancelled` };
    default:
      return { title: '📋 Order Update', body: `Your order${id} status: ${status}` };
  }
}
