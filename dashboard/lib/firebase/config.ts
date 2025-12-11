import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBCAeaaJMMw3_Egf-6-4i63IhAUy4EyzBc",
  authDomain: "teste-brocker.firebaseapp.com",
  projectId: "teste-brocker",
  storageBucket: "teste-brocker.firebasestorage.app",
  messagingSenderId: "44407447466",
  appId: "1:44407447466:web:ce5fde6a8104a1b82bd5d3",
  measurementId: "G-MHKNE6H1ZS"
};

// Initialize Firebase (only once)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
