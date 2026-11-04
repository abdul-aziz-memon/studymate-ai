import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";

const settingsButton = document.getElementById("settings-button");
const settingsDialog = document.getElementById("settings-dialog");
const settingsCloseButton = document.getElementById("settings-close-button");
const settingsNotice = document.getElementById("settings-account-notice");
const accountPanel = document.getElementById("settings-account-panel");
const signedOutPanel = document.getElementById("settings-signed-out");
const accountName = document.getElementById("settings-account-name");
const accountEmail = document.getElementById("settings-account-email");
const accountAvatar = document.getElementById("settings-account-avatar");
const profileForm = document.getElementById("profile-form");
const displayNameInput = document.getElementById("settings-display-name");
const profileFeedback = document.getElementById("profile-feedback");
const passwordForm = document.getElementById("password-form");
const passwordFormContainer = document.getElementById("password-settings");
const passwordProviderNote = document.getElementById("password-provider-note");
const passwordFeedback = document.getElementById("password-feedback");
const logoutButton = document.getElementById("settings-logout-button");
const logoutFeedback = document.getElementById("logout-feedback");
let currentUser = null;

function getErrorMessage(error) {
  const messages = {
    "auth/invalid-credential": "The current password is incorrect.",
    "auth/wrong-password": "The current password is incorrect.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/requires-recent-login": "For your security, sign out and sign in again before making this change.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/network-request-failed": "Couldn't connect. Check your internet connection and try again.",
    "auth/user-disabled": "This account is currently disabled."
  };
  return messages[error.code] || "Something went wrong. Please try again.";
}

function setFormBusy(form, busy) {
  form.querySelectorAll("input, button").forEach((control) => {
    control.disabled = busy;
  });
}

function syncAccount(user) {
  currentUser = user;
  accountPanel.hidden = !user;
  signedOutPanel.hidden = Boolean(user);
  settingsNotice.textContent = "";

  if (!user) {
    settingsNotice.textContent = auth
      ? "You’re not signed in."
      : "Firebase is not connected yet. Add your project config to js/firebase-config.js.";
    return;
  }

  const name = user.displayName?.trim() || "StudyMate learner";
  accountName.textContent = name;
  accountEmail.textContent = user.email || "Email unavailable";
  accountAvatar.textContent = name.charAt(0).toUpperCase() || "S";
  displayNameInput.value = user.displayName || "";

  const supportsPassword = user.providerData.some((provider) => provider.providerId === "password");
  passwordForm.hidden = !supportsPassword;
  passwordProviderNote.hidden = supportsPassword;
}

settingsButton.addEventListener("click", () => {
  if (!settingsDialog.open) {
    settingsDialog.showModal();
  }
});

settingsCloseButton.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) {
    settingsDialog.close();
  }
});
settingsDialog.addEventListener("close", () => {
  const sidebarIsClosed = document.querySelector(".chat-workspace").classList.contains("sidebar-closed");
  document.getElementById(sidebarIsClosed ? "sidebar-toggle-button" : "settings-button").focus();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = displayNameInput.value.trim();
  if (!profileForm.reportValidity() || !currentUser || name.length < 2) {
    return;
  }

  setFormBusy(profileForm, true);
  profileFeedback.textContent = "";
  try {
    await updateProfile(currentUser, { displayName: name });
    accountName.textContent = name;
    accountAvatar.textContent = name.charAt(0).toUpperCase();
    profileFeedback.textContent = "Your name has been updated.";
  } catch (error) {
    profileFeedback.textContent = getErrorMessage(error);
  } finally {
    setFormBusy(profileForm, false);
  }
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!passwordForm.reportValidity() || !currentUser?.email) {
    return;
  }

  const currentPassword = passwordForm.elements.namedItem("currentPassword").value;
  const newPassword = passwordForm.elements.namedItem("newPassword").value;
  const confirmPassword = passwordForm.elements.namedItem("confirmPassword").value;
  if (newPassword !== confirmPassword) {
    passwordFeedback.textContent = "The new passwords do not match.";
    passwordForm.elements.namedItem("confirmPassword").focus();
    return;
  }
  if (newPassword === currentPassword) {
    passwordFeedback.textContent = "Choose a new password different from your current one.";
    passwordForm.elements.namedItem("newPassword").focus();
    return;
  }

  setFormBusy(passwordForm, true);
  passwordFeedback.textContent = "";
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await reauthenticateWithCredential(currentUser, credential);
    await updatePassword(currentUser, newPassword);
    passwordForm.reset();
    passwordFeedback.textContent = "Your password has been changed.";
  } catch (error) {
    passwordFeedback.textContent = getErrorMessage(error);
  } finally {
    setFormBusy(passwordForm, false);
  }
});

logoutButton.addEventListener("click", async () => {
  if (!auth || !currentUser) {
    logoutFeedback.textContent = "You’re not signed in.";
    return;
  }

  logoutButton.disabled = true;
  logoutFeedback.textContent = "";
  try {
    await signOut(auth);
    window.location.replace("login.html");
  } catch (error) {
    logoutFeedback.textContent = getErrorMessage(error);
    logoutButton.disabled = false;
  }
});

if (auth) {
  onAuthStateChanged(auth, syncAccount, (error) => {
    settingsNotice.textContent = getErrorMessage(error);
  });
} else {
  syncAccount(null);
}
