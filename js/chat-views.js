document.addEventListener("DOMContentLoaded", () => {
  const workspace = document.querySelector(".chat-workspace");
  const chatView = document.getElementById("chat-conversation-view");
  const gamesView = document.getElementById("games-view");
  const settingsView = document.getElementById("settings-view");
  const viewButtons = document.querySelectorAll("[data-app-view]");
  const sidebarToggleButton = document.getElementById("sidebar-toggle-button");

  if (!workspace || !chatView || !gamesView || !settingsView) {
    return;
  }

  function showView(viewName) {
    const activeView = ["chat", "games", "settings"].includes(viewName) ? viewName : "chat";
    chatView.hidden = activeView !== "chat";
    gamesView.hidden = activeView !== "games";
    settingsView.hidden = activeView !== "settings";

    viewButtons.forEach((button) => {
      if (button.dataset.appView === activeView) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    document.dispatchEvent(new CustomEvent("studymate:show-view", { detail: activeView }));
    if (window.matchMedia("(max-width: 700px)").matches) {
      workspace.classList.add("sidebar-closed");
      sidebarToggleButton.setAttribute("aria-expanded", "false");
      sidebarToggleButton.setAttribute("aria-label", "Open chat sidebar");
    }
  }

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.appView));
  });

  document.addEventListener("studymate:navigate-view", (event) => showView(event.detail));
  document.getElementById("new-chat-button")?.addEventListener("click", () => showView("chat"));
});
