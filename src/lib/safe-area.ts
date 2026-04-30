export function initSafeArea() {
  const root = document.documentElement;

  new MutationObserver(() => {
    getComputedStyle(root).getPropertyValue("--safe-area-inset-top");
    getComputedStyle(root).getPropertyValue("--safe-area-inset-bottom");
  }).observe(root, { attributes: true, attributeFilter: ["style"] });

  setTimeout(() => {
    const top = getComputedStyle(root)
      .getPropertyValue("--safe-area-inset-top")
      .trim();
    if (!top || top === "0px") {
      root.style.setProperty("--safe-area-inset-top", "24px");
      root.style.setProperty("--safe-area-inset-bottom", "48px");
    }
  }, 1000);
}
