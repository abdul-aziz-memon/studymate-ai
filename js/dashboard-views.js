document.addEventListener("DOMContentLoaded", () => {
  const workspace = document.querySelector(".dashboard-workspace");
  const views = [...document.querySelectorAll(".dashboard-view")];
  const viewButtons = document.querySelectorAll("[data-dashboard-view]");
  const navButtons = document.querySelectorAll(".dashboard-nav-button");
  const sidebarToggleButton = document.getElementById("dashboard-sidebar-toggle");
  const sidebarBackdrop = document.getElementById("dashboard-sidebar-backdrop");

  if (!workspace || !views.length || !sidebarToggleButton || !sidebarBackdrop) {
    return;
  }

  const mobileViewport = window.matchMedia("(max-width: 760px)");
  let isMobile = mobileViewport.matches;

  function setSidebarOpen(isOpen) {
    workspace.classList.toggle("sidebar-open", isMobile && isOpen);
    workspace.classList.toggle("sidebar-collapsed", !isMobile && !isOpen);
    sidebarToggleButton.setAttribute("aria-expanded", String(isOpen));
    sidebarToggleButton.setAttribute("aria-label", `${isOpen ? "Close" : "Open"} dashboard navigation`);
  }

  function showView(viewName) {
    const activeView = views.some((view) => view.id === `${viewName}-view`) ? viewName : "overview";
    views.forEach((view) => {
      view.hidden = view.id !== `${activeView}-view`;
    });
    navButtons.forEach((button) => {
      if (button.dataset.dashboardView === activeView) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
    if (isMobile) {
      setSidebarOpen(false);
    }
  }

  setSidebarOpen(!isMobile);

  viewButtons.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.dashboardView));
  });

  sidebarToggleButton.addEventListener("click", () => {
    const isOpen = isMobile
      ? workspace.classList.contains("sidebar-open")
      : !workspace.classList.contains("sidebar-collapsed");
    setSidebarOpen(!isOpen);
  });
  sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));

  window.addEventListener("resize", () => {
    const mobile = mobileViewport.matches;
    if (mobile === isMobile) {
      return;
    }
    isMobile = mobile;
    setSidebarOpen(!isMobile);
  });
});
