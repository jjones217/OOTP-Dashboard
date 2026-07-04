// Fallback Firebase web config, used when the VITE_FIREBASE_* environment
// variables aren't set (e.g. desktop builds from CI without repo secrets).
//
// It is safe to commit these values: the Firebase web config is shipped to
// every browser that loads the web app anyway — it identifies the project,
// it doesn't grant access. Access control lives in the database rules.
//
// Paste the values from Firebase Console → Project settings → General →
// Your apps → SDK setup and configuration.
export default {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
