import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { app } from "./firebase-app.js";

export { auth } from "./firebase-auth.js";

export const db = app ? getFirestore(app) : null;
