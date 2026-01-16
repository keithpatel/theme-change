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
  apiKey: "AIzaSyDB0VXMo8LeaRZg-EXE-oGuQfvoYbuKeT4",
  authDomain: "mandal-fdafb.firebaseapp.com",
  projectId: "mandal-fdafb",
  storageBucket: "mandal-fdafb.firebasestorage.app",
  messagingSenderId: "387171044862",
  appId: "1:387171044862:web:db374f201f0f8bc9ff44af"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);