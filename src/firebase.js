import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import fallbackConfig from './firebase-config';

// Environment variables win; src/firebase-config.js fills the gaps so
// desktop builds work without build-time env vars.
const env = import.meta.env;
const pick = (envValue, fallback) => envValue || fallback || '';

const firebaseConfig = {
  apiKey: pick(env.VITE_FIREBASE_API_KEY, fallbackConfig.apiKey),
  authDomain: pick(env.VITE_FIREBASE_AUTH_DOMAIN, fallbackConfig.authDomain),
  databaseURL: pick(env.VITE_FIREBASE_DATABASE_URL, fallbackConfig.databaseURL),
  projectId: pick(env.VITE_FIREBASE_PROJECT_ID, fallbackConfig.projectId),
  storageBucket: pick(env.VITE_FIREBASE_STORAGE_BUCKET, fallbackConfig.storageBucket),
  messagingSenderId: pick(
    env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    fallbackConfig.messagingSenderId
  ),
  appId: pick(env.VITE_FIREBASE_APP_ID, fallbackConfig.appId),
};

export const firebaseReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.databaseURL
);

const app = firebaseReady ? initializeApp(firebaseConfig) : null;

export const db = app ? getDatabase(app) : null;
