import {
  EmailAuthProvider,
  GoogleAuthProvider,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, deleteDoc, doc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { CHAT_HISTORY_STORAGE_KEY } from "./chat-storage.js";
import { getUserProfile, isCompleteUserProfile, saveUserProfile } from "./user-profile.js";

const settingsNotice = document.getElementById("settings-account-notice");
const accountPanel = document.getElementById("settings-account-panel");
const signedOutPanel = document.getElementById("settings-signed-out");
const accountName = document.getElementById("settings-account-name");
const accountEmail = document.getElementById("settings-account-email");
const accountAvatar = document.getElementById("settings-account-avatar");
const profileForm = document.getElementById("profile-form");
const displayNameInput = document.getElementById("settings-display-name");
const gradeInput = document.getElementById("settings-grade");
const profileFeedback = document.getElementById("profile-feedback");
const passwordForm = document.getElementById("password-form");
const passwordFormContainer = document.getElementById("password-settings");
const passwordProviderNote = document.getElementById("password-provider-note");
const passwordFeedback = document.getElementById("password-feedback");
const logoutButton = document.getElementById("settings-logout-button");
const logoutFeedback = document.getElementById("logout-feedback");
const deleteAccountForm = document.getElementById("delete-account-form");
const deleteAccountPasswordField = document.getElementById("delete-account-password-field");
const deleteAccountProviderNote = document.getElementById("delete-account-provider-note");
const deleteAccountFeedback = document.getElementById("delete-account-feedback");
const deleteAccountButton = document.getElementById("delete-account-button");
let currentUser = null;

function getErrorMessage(error) {
  const messages = {
    "auth/invalid-credential": "The current password is incorrect.",
    "auth/wrong-password": "The current password is incorrect.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/requires-recent-login": "For your security, sign out and sign in again before making this change.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/network-request-failed": "Couldn't connect. Check your internet connection and try again.",
    "auth/user-disabled": "This account is currently disabled.",
    "auth/popup-closed-by-user": "Google confirmation was closed before it finished.",
    "auth/popup-blocked": "Allow popups for this site to confirm your Google account.",
    "auth/cancelled-popup-request": "A Google confirmation request is already in progress."
  };
  return messages[error.code] || "Something went wrong. Please try again.";
}

function getAccountDeletionError(error, stage) {
  if (stage === "account") {
    if (error.code === "auth/requires-recent-login") {
      return "Your saved StudyMate data was deleted, but Firebase did not remove the sign-in account. Contact support to finish account deletion.";
    }
    return `Your saved StudyMate data was deleted, but the sign-in account could not be removed: ${getErrorMessage(error)}`;
  }
  if (stage === "local") {
    return `This browser's saved chats could not be cleared, so your account was not deleted: ${error.message || getErrorMessage(error)}`;
  }
  if (stage === "cloud") {
    return `Could not delete all cloud data. This browser's saved chats have already been cleared, and some cloud records may already have been deleted. Please retry: ${error.message || getErrorMessage(error)}`;
  }
  return getErrorMessage(error);
}

function setFormBusy(form, busy) {
  form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = busy;
  });
  if (form === deleteAccountForm) {
    deleteAccountButton.textContent = busy ? "Deleting account..." : "Delete my account and data";
  }
}

async function syncAccount(user) {
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

  try {
    const profile = await getUserProfile(user);
    if (!isCompleteUserProfile(profile)) {
      window.location.replace("/account");
      return;
    }

    const name = profile.displayName;
    accountName.textContent = name;
    accountEmail.textContent = user.email || "Email unavailable";
    accountAvatar.textContent = name.charAt(0).toUpperCase() || "S";
    displayNameInput.value = name;
    gradeInput.value = profile.grade;

    const supportsPassword = user.providerData.some((provider) => provider.providerId === "password");
    passwordForm.hidden = !supportsPassword;
    passwordProviderNote.hidden = supportsPassword;
    deleteAccountPasswordField.hidden = !supportsPassword;
    deleteAccountPasswordField.querySelector("input").required = supportsPassword;
    deleteAccountProviderNote.hidden = supportsPassword;
  } catch (error) {
    settingsNotice.textContent = `Could not load your profile: ${error.message}`;
  }
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = displayNameInput.value.trim();
  if (!profileForm.reportValidity() || !currentUser || name.length < 2) {
    return;
  }

  setFormBusy(profileForm, true);
  profileFeedback.textContent = "";
  try {
    const profile = await saveUserProfile(currentUser, name, gradeInput.value);
    accountName.textContent = name;
    accountAvatar.textContent = name.charAt(0).toUpperCase();
    gradeInput.value = profile.grade;
    profileFeedback.textContent = "Your display name and grade have been updated.";
    document.dispatchEvent(new CustomEvent("studymate:profile-updated", { detail: { displayName: name } }));
  } catch (error) {
    profileFeedback.textContent = error.code ? getErrorMessage(error) : error.message;
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

deleteAccountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!deleteAccountForm.reportValidity() || !currentUser || !auth || !db) {
    if (!db) {
      deleteAccountFeedback.textContent = "Firebase is not connected, so your account cannot be deleted.";
    }
    return;
  }
  if (deleteAccountForm.elements.namedItem("confirmation").value.trim() !== "DELETE") {
    deleteAccountFeedback.textContent = "Type DELETE exactly to confirm account deletion.";
    return;
  }

  const user = currentUser;
  const supportsPassword = user.providerData.some((provider) => provider.providerId === "password");
  const supportsGoogle = user.providerData.some((provider) => provider.providerId === "google.com");
  if (!supportsPassword && !supportsGoogle) {
    deleteAccountFeedback.textContent = "This sign-in method cannot be reauthenticated here. Contact support to delete your account.";
    return;
  }

  let stage = "reauthentication";
  setFormBusy(deleteAccountForm, true);
  setFormBusy(profileForm, true);
  setFormBusy(passwordForm, true);
  logoutButton.disabled = true;
  deleteAccountFeedback.textContent = "";
  try {
    if (supportsPassword) {
      const password = deleteAccountForm.elements.namedItem("password").value;
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    } else {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }

    if (auth.currentUser?.uid !== user.uid) {
      throw new Error("Your account changed during confirmation. Please try again.");
    }

    stage = "local";
    localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);

    stage = "cloud";
    const [activitySnapshot, topicsSnapshot] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "activity")),
      getDocs(collection(db, "users", user.uid, "topics"))
    ]);
    const records = [...activitySnapshot.docs, ...topicsSnapshot.docs];
    for (let index = 0; index < records.length; index += 20) {
      await Promise.all(records.slice(index, index + 20).map((record) => deleteDoc(record.ref)));
    }
    await Promise.all([
      deleteDoc(doc(db, "users", user.uid)),
      deleteDoc(doc(db, "leaderboard", user.uid))
    ]);

    stage = "account";
    await deleteUser(user);
    window.location.replace("login.html");
  } catch (error) {
    deleteAccountFeedback.textContent = getAccountDeletionError(error, stage);
    setFormBusy(deleteAccountForm, false);
    setFormBusy(profileForm, false);
    setFormBusy(passwordForm, false);
    logoutButton.disabled = false;
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
