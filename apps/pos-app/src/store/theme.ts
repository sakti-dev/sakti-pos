import { createEffect, createSignal, onCleanup } from "solid-js";

type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "sakti-pos:theme";

const [theme, setThemeInternal] = createSignal<Theme>(
  (localStorage.getItem(STORAGE_KEY) as Theme) ?? "system"
);

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(t: Theme) {
  const isDark = t === "dark" || (t === "system" && mediaQuery.matches);
  document.documentElement.classList.toggle("dark", isDark);
}

export { theme };

export function setTheme(t: Theme) {
  setThemeInternal(t);
  localStorage.setItem(STORAGE_KEY, t);
  applyTheme(t);
}

createEffect(() => {
  applyTheme(theme());
});

const handleMediaChange = () => {
  if (theme() === "system") {
    applyTheme("system");
  }
};

mediaQuery.addEventListener("change", handleMediaChange);
onCleanup(() => mediaQuery.removeEventListener("change", handleMediaChange));

applyTheme(theme());
