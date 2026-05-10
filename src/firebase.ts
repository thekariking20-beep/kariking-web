import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicit LOCAL persistence — user stays logged in until manual logout
setPersistence(auth, browserLocalPersistence).catch(console.error);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// Offline Mode Resiliency — enable IndexedDB persistence for offline support
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn('Multiple tabs open, persistence disabled');
  } else if (err.code == 'unimplemented') {
    console.warn('Browser lacks indexedDB support');
  }
});

// Firebase Cloud Messaging (FCM) — requires browser support
import { getMessaging, isSupported } from 'firebase/messaging';

let messaging: ReturnType<typeof getMessaging> | null = null;

isSupported().then(supported => {
  if (supported) {
    messaging = getMessaging(app);
  }
}).catch(() => {});

export { messaging };
export { app as firebaseApp };
