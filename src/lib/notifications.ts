import { getToken, onMessage, type MessagePayload } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, messaging } from '../firebase';

// ─── VAPID Key (from Firebase Console → Cloud Messaging → Web Push certificates) ─
// You can generate this in: Firebase Console → Project Settings → Cloud Messaging → Web configuration
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

/**
 * Request notification permission from the user.
 * Returns true if granted, false otherwise.
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
 * Get FCM token for this device.
 * Returns the token string, or null if unavailable.
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    if (!messaging) {
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

    const token = await getToken(messaging, {
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

/**
 * Register FCM token on login.
 * Combines all steps: permission → get token → save to Firestore.
 */
export async function registerPushNotifications(uid: string): Promise<void> {
  try {
    const token = await getFCMToken();
    if (token) {
      await saveFCMToken(uid, token);
      console.log('✅ FCM token registered');
    }
  } catch (err) {
    console.error('Failed to register push notifications:', err);
  }
}

/**
 * Listen for foreground messages.
 * Calls the callback whenever a notification arrives while the app is open.
 */
export function onForegroundMessage(
  callback: (payload: MessagePayload) => void
): (() => void) | null {
  if (!messaging) return null;

  const unsubscribe = onMessage(messaging, (payload) => {
    console.log('📩 Foreground notification:', payload);
    callback(payload);
  });

  return unsubscribe;
}

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
