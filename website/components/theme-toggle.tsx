// Light/dark switch: toggles `.dark` on <html> (defuss-shadcn's dark-mode hook) and remembers the choice.
import { createRef } from "defuss";

export default function ThemeToggle() {
  const checkboxRef = createRef<HTMLInputElement>();
  // The page is rendered at build time (onMount runs there too), so the theme is only known in the browser.
  const showCurrentTheme = () => {
    if (typeof document === "undefined") return;
    if (checkboxRef.current) checkboxRef.current.checked = document.documentElement.classList.contains("dark");
  };
  const applyTheme = (event: Event) => {
    const darkModeEnabled = (event.target as HTMLInputElement).checked;
    document.documentElement.classList.toggle("dark", darkModeEnabled);
    try {
      localStorage.setItem("theme", darkModeEnabled ? "dark" : "light");
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this page.
    }
  };
  return (
    <label class="swap">
      <input type="checkbox" aria-label="Dark mode" ref={checkboxRef} onMount={showCurrentTheme} onChange={applyTheme} />
      <span class="swap-on" aria-hidden="true">☾</span>
      <span class="swap-off" aria-hidden="true">☀</span>
    </label>
  );
}
