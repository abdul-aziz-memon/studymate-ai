document.addEventListener("DOMContentLoaded", () => {
  const moveToTop = document.getElementById("move-to-top");

  moveToTop?.addEventListener("click", () => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    window.scrollTo({ top: 0, behavior });
  });
});
