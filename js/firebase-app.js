import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

export const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
