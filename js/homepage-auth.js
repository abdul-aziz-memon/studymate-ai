import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";

const authNavigationLink = document.getElementById("auth-navigation-link");

if (auth && authNavigationLink) {
  onAuthStateChanged(
    auth,
    (user) => {
      if (!user) {
        return;
      }

      authNavigationLink.href = "dashboard.html";
      authNavigationLink.setAttribute("aria-label", "Go to your StudyMate AI dashboard");
      authNavigationLink.querySelector("span").textContent = "Dashboard";
    },
    (error) => {
      console.error("Could not check the current authentication state.", error);
    }
  );
}
