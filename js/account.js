import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";
import { getUserProfile, isCompleteUserProfile, saveUserProfile } from "./user-profile.js";

const form = document.getElementById("account-form");
const displayNameInput = document.getElementById("account-display-name");
const gradeInput = document.getElementById("account-grade");
const message = document.getElementById("account-message");
const loading = document.getElementById("account-loading");
const submitButton = document.getElementById("account-submit");
let currentUser = null;
let profileCheck = 0;

function setBusy(busy) {
  displayNameInput.disabled = busy;
  gradeInput.disabled = busy;
  submitButton.disabled = busy;
  submitButton.querySelector("span").textContent = busy ? "Saving..." : "Save profile";
}

if (!auth) {
  loading.textContent = "Firebase is not configured. Please contact the site administrator.";
} else {
  onAuthStateChanged(auth, async (user) => {
    const checkId = ++profileCheck;
    if (!user) {
      window.location.replace("/login.html");
      return;
    }

    currentUser = user;
    loading.textContent = "Checking your account...";
    try {
      const profile = await getUserProfile(user);
      if (checkId !== profileCheck) {
        return;
      }
      if (isCompleteUserProfile(profile)) {
        window.location.replace("/dashboard.html");
        return;
      }

      displayNameInput.value = profile?.displayName || user.displayName || "";
      gradeInput.value = profile?.grade || "";
      loading.hidden = true;
      form.hidden = false;
      displayNameInput.focus();
    } catch (error) {
      if (checkId !== profileCheck) {
        return;
      }
      loading.textContent = `Could not load your profile: ${error.message}`;
    }
  }, (error) => {
    loading.textContent = `Could not check your account: ${error.message}`;
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || !currentUser) {
    return;
  }

  setBusy(true);
  message.textContent = "";
  try {
    await saveUserProfile(currentUser, displayNameInput.value, gradeInput.value);
    window.location.replace("/dashboard.html");
  } catch (error) {
    message.textContent = error.message || "Could not save your profile. Please try again.";
  } finally {
    setBusy(false);
  }
});
