export function initSafeArea() {
  const root = document.documentElement;

  new MutationObserver(() => {
    const top = getComputedStyle(root).getPropertyValue("--safe-area-inset-top");
    const bottom = getComputedStyle(root).getPropertyValue("--safe-area-inset-bottom");
    console.log("[safe-area] top:", top, "| bottom:", bottom);
  }).observe(root, { attributes: true, attributeFilter: ["style"] });

  setTimeout(() => {
    const top = getComputedStyle(root).getPropertyValue("--safe-area-inset-top").trim();
    if (!top || top === "0px") {
      console.warn("[safe-area] No insets detected (Waydroid?). Injecting fallback.");
      root.style.setProperty("--safe-area-inset-top", "24px");
      root.style.setProperty("--safe-area-inset-bottom", "48px");
    } else {
      console.log("[safe-area] top:", top);
    }
  }, 1000);
}
