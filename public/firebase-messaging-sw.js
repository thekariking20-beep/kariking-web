/* eslint-disable no-undef */
// Firebase Messaging Service Worker — Handles background push notifications
// This file MUST be at /firebase-messaging-sw.js (in public/) for FCM to work

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBQ57Gnk82f1SQj9zn2nHB3MclOb-JtBj8",
  authDomain: "kariking.firebaseapp.com",
  projectId: "kariking",
  storageBucket: "kariking.firebasestorage.app",
  messagingSenderId: "874816816823",
  appId: "1:874816816823:web:f439724f0b5aaef2772f32",
});

const messaging = firebase.messaging();

// Handle background messages (when app is closed or minimized)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  const title = payload.notification?.title || 'Kari King';
  const type = payload.data?.type || '';
  const isAdminNotif = ['new_order', 'utr_submitted', 'kyc_request', 'bulk_booking_new', 'bulk_booking_paid', 'withdrawal_request'].includes(type);

  const options = {
    body: payload.notification?.body || 'You have a new update',
    icon: '/logo.png',
    badge: '/logo.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: payload.data?.orderId || payload.data?.bookingId || `kk-${type}-${Date.now()}`,
    renotify: true,
    requireInteraction: isAdminNotif,
    data: payload.data || {},
    actions: [
      { action: 'open', title: isAdminNotif ? 'View in Dashboard' : 'View Order' },
    ],
  };

  self.registration.showNotification(title, options);
});

// Handle notification click — open the correct page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const type = data.type || '';

  // Determine target URL based on notification type
  let targetUrl = '/orders';
  if (['new_order', 'utr_submitted', 'kyc_request', 'bulk_booking_new', 'bulk_booking_paid', 'delivery_assignment', 'withdrawal_request'].includes(type)) {
    targetUrl = '/admin';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            orderId: data.orderId,
            notificationType: type,
          });
          return;
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
