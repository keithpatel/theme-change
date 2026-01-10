// @ts-ignore
import { initializeApp } from "firebase/app";
// @ts-ignore
import { getAuth } from "firebase/auth";
// @ts-ignore
import { getFirestore } from "firebase/firestore";

// Ideally, use import.meta.env.VITE_FIREBASE_API_KEY for Vercel
// For now, we keep the hardcoded values to ensure it works immediately for you.
// When deploying to Vercel, you should add these as Environment Variables.
const firebaseConfig = {
  apiKey: "AIzaSyAdNHwir2EWLMm4CuH-gVwkVWlPk-33tLU",
  authDomain: "hapto2.firebaseapp.com",
  databaseURL: "https://hapto2-default-rtdb.firebaseio.com",
  projectId: "hapto2",
  storageBucket: "hapto2.firebasestorage.app",
  messagingSenderId: "790915133226",
  appId: "1:790915133226:web:e6a49611817e23ce51b853"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);