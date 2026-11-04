import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";

const accountName = document.getElementById("account-name");
const accountEmail = document.getElementById("account-email");
const accountAvatar = document.getElementById("account-avatar");
const welcomeName = document.getElementById("welcome-name");
const logoutButton = document.getElementById("logout-button");
const message = document.getElementById("dashboard-message");

if (!auth) {
  window.location.replace("login.html");
} else {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace("login.html");
      return;
    }

    const name = user.displayName?.trim() || "learner";
    const initial = name.charAt(0).toUpperCase() || "S";
    accountName.textContent = name;
    accountEmail.textContent = user.email || "";
    accountAvatar.textContent = initial;
    welcomeName.textContent = name;
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    message.textContent = "";

    try {
      await signOut(auth);
      window.location.replace("login.html");
    } catch {
      message.textContent = "Could not log out. Please try again.";
      logoutButton.disabled = false;
    }
  });
}
