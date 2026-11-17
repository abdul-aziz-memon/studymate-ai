const authNavigationLink = document.getElementById("auth-navigation-link");

async function updateAuthenticatedNavigation() {
  try {
    const [{ onAuthStateChanged }, { auth }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
      import("./firebase-auth.js")
    ]);

    if (!auth) {
      return;
    }

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
  } catch (error) {
    console.error("Could not load the current authentication state.", error);
  }
}

if (authNavigationLink) {
  const loadAuthentication = () => {
    void updateAuthenticatedNavigation();
  };

  if (document.readyState === "complete") {
    loadAuthentication();
  } else {
    window.addEventListener("load", loadAuthentication, { once: true });
  }
}
