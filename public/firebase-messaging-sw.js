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
  const options = {
    body: payload.notification?.body || 'You have a new update',
    icon: '/kariking-logo.jpg',
    badge: '/kariking-logo.jpg',
    vibrate: [200, 100, 200],
    tag: payload.data?.orderId || 'kari-king-notification', // Prevent duplicate notifications
    renotify: true,
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'View Order' },
    ],
  };

  self.registration.showNotification(title, options);
});

// Handle notification click — open the correct order
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const orderId = event.notification.data?.orderId;
  const type = event.notification.data?.type;
  
  // Determine target URL based on notification type
  let targetUrl = '/orders';
  if (type === 'new_order' || type === 'delivery_assignment') {
    targetUrl = '/admin'; // Admin notifications go to admin page
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            orderId: orderId,
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
