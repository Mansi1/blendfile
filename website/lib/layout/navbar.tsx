// VERIFIED: top bar of every page: brand (the link to the overview, which reloads it: data-no-nav keeps defuss-ssg's client
// navigation out, as that skips a link to the current page), the main links, the repository on GitHub and the theme toggle (the one hydrated part,
// from components/). Its content sits in the same 72rem column as the page (site.css).
import type { Props } from "defuss";
import ThemeToggle from "../../components/theme-toggle.js";

const MAIN_LINKS = [
  { route: "/#playground", label: "Playground" },
  { route: "/docs.html", label: "Docs" },
  { route: "/docs.html#vscode-extension", label: "VS Code" },
  { route: "https://github.com/Mansi1/blendfile", label: "GitHub" },
];

// Native Popover API attributes the defuss JSX types do not declare yet.
const MENU_TOGGLE_ATTRIBUTES: Record<string, string> = { popovertarget: "main-menu" };
const MENU_POPOVER_ATTRIBUTES: Record<string, string> = { popover: "auto" };

/** "page" for the link of the current page. */
const currentAttribute = (route: string, currentRoute: string) => (route === currentRoute ? "page" : undefined);

export function Navbar({ route }: Props & { route: string }) {
  return (
    <nav class="navbar" data-collapse="md" data-position="sticky" aria-label="Main">
      <div class="navbar-start">
        <button class="btn navbar-toggle" data-variant="ghost" data-size="icon" {...MENU_TOGGLE_ATTRIBUTES} aria-label="Menu">☰</button>
        <a class="navbar-brand" href="/" data-no-nav><img src="/assets/icon.svg" alt="" width="28" height="28" />blendfile</a>
      </div>
      <div class="navbar-center">
        <div class="navbar-collapse" id="main-menu" {...MENU_POPOVER_ATTRIBUTES}>
          <ul class="navbar-menu">
            {MAIN_LINKS.map((link) => (
              <li key={link.route}><a href={link.route} aria-current={currentAttribute(link.route, route)}>{link.label}</a></li>
            ))}
          </ul>
        </div>
      </div>
      <div class="navbar-end">
        <ThemeToggle />
      </div>
    </nav>
  );
}
