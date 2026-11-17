import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app } from "./firebase-app.js";

export const auth = app ? getAuth(app) : null;
