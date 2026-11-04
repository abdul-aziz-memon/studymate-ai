import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";

const form = document.getElementById("auth-form");
const nameGroup = document.getElementById("name-group");
const displayNameInput = document.getElementById("display-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("form-message");
const submitButton = document.getElementById("submit-button");
const submitLabel = document.getElementById("submit-label");
const googleButton = document.getElementById("google-button");
const resetButton = document.getElementById("reset-password");
const title = document.getElementById("form-title");
const intro = document.getElementById("form-intro");
let mode = document.body.dataset.authMode === "signup" ? "signup" : "login";
let isSubmitting = false;

function showMessage(text, kind = "error") {
  message.textContent = text;
  message.dataset.kind = kind;
}

function getErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "An account already uses this email. Try signing in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/invalid-credential": "That email and password combination does not match.",
    "auth/user-disabled": "This account is currently disabled.",
    "auth/user-not-found": "No account was found for this email.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/wrong-password": "That email and password combination does not match.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/popup-blocked": "Allow popups for this site to continue with Google.",
    "auth/cancelled-popup-request": "A Google sign-in request is already in progress.",
    "auth/unauthorized-domain": "This site domain is not authorized in your Firebase project.",
    "auth/operation-not-allowed": "Enable Google sign-in in your Firebase Authentication settings.",
    "auth/account-exists-with-different-credential": "An account with this email already exists. Sign in with its original method."
  };
  return messages[error.code] || "Something went wrong. Please try again.";
}

function setMode() {
  const signingUp = mode === "signup";
  nameGroup.classList.toggle("is-hidden", !signingUp);
  displayNameInput.required = signingUp;
  passwordInput.autocomplete = signingUp ? "new-password" : "current-password";
  resetButton?.classList.toggle("is-hidden", signingUp);
  title.textContent = signingUp ? "Create your account" : "Welcome back";
  intro.textContent = signingUp
    ? "Start a study space that is yours."
    : "Sign in to pick up where you left off.";
  submitLabel.textContent = signingUp ? "Create account" : "Sign in";
  showMessage("");
}

setMode();

function setBusy(isBusy) {
  submitButton.disabled = isBusy || !auth;
  submitLabel.textContent = isBusy
    ? "Please wait..."
    : mode === "signup" ? "Create account" : "Sign in";
  if (googleButton) {
    googleButton.disabled = isBusy || !auth;
  }
  if (resetButton) {
    resetButton.disabled = isBusy || !auth;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) {
    return;
  }
  if (!auth) {
    showMessage("Firebase is not connected yet. Add your project config to js/firebase-config.js.");
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  isSubmitting = true;
  setBusy(true);
  showMessage("");

  try {
    if (mode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: displayNameInput.value.trim() });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    window.location.replace("dashboard.html");
  } catch (error) {
    showMessage(getErrorMessage(error));
  } finally {
    isSubmitting = false;
    setBusy(false);
  }
});

googleButton?.addEventListener("click", async () => {
  if (!auth) {
    showMessage("Firebase is not connected yet. Add your project config to js/firebase-config.js.");
    return;
  }

  isSubmitting = true;
  setBusy(true);
  showMessage("");
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    window.location.replace("dashboard.html");
  } catch (error) {
    showMessage(getErrorMessage(error));
  } finally {
    isSubmitting = false;
    setBusy(false);
  }
});

resetButton?.addEventListener("click", async () => {
  if (!auth) {
    showMessage("Firebase is not connected yet. Add your project config to js/firebase-config.js.");
    return;
  }
  if (!emailInput.reportValidity()) {
    emailInput.focus();
    return;
  }

  resetButton.disabled = true;
  showMessage("");
  try {
    await sendPasswordResetEmail(auth, emailInput.value.trim());
    showMessage("Password reset email sent. Check your inbox.", "success");
  } catch (error) {
    showMessage(getErrorMessage(error));
  } finally {
    resetButton.disabled = false;
  }
});

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user && !isSubmitting) {
      window.location.replace("dashboard.html");
    }
  });
} else {
  showMessage("Firebase is not connected yet. Add your project config to js/firebase-config.js.");
  setBusy(false);
}
