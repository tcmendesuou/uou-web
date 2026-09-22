import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ✅ Mesmo projeto Firebase do App/Admin — login e dados compartilhados.
const firebaseConfig = {
  apiKey: "AIzaSyByza7K-GhBBh5HGgBlRyl8m0q2jUQ7TIs",
  authDomain: "butter-1a8d4.firebaseapp.com",
  projectId: "butter-1a8d4",
  storageBucket: "butter-1a8d4.firebasestorage.app",
  messagingSenderId: "5668336252",
  appId: "1:5668336252:web:f125434382fa18d514cff9"
};

let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
