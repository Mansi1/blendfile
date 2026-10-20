// Build-time page shell: head, navbar, docs navigation and the content column (not hydrated).
import type { Props } from "defuss";
import ThemeToggle from "../components/theme-toggle.js";
import { listSpecPages } from "./spec.ts";
import { SITE } from "./site.ts";
import { UI_SCRIPTS } from "./ui.ts";

export interface LayoutProps extends Props {
  title: string;
  description: string;
  /** Route of the current page, e.g. `/usage.html`, to mark it in the navigation. */
  currentRoute: string;
}

const PRIMARY_LINKS = [
  { route: "/", label: "Overview" },
  { route: "/spec/index.html", label: "Specification" },
  { route: "/usage.html", label: "Library" },
  { route: "/inspector.html", label: "Inspector" },
  { route: "/vscode.html", label: "VS Code" },
];

const GUIDE_LINKS = [
  { route: "/", label: "Overview" },
  { route: "/usage.html", label: "Using the library" },
  { route: "/inspector.html", label: "Inspector" },
  { route: "/vscode.html", label: "VS Code extension" },
];

// Applied before first paint so the page does not flash light in dark mode.
// The SSR serializer escapes "&", "<" and ">" inside <script>, so this snippet avoids them.
const THEME_BOOTSTRAP = `try{var theme=localStorage.getItem("theme");var dark=theme?theme==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(dark)document.documentElement.classList.add("dark")}catch(error){}`;

// Native Popover API attributes the defuss JSX types do not declare yet.
const MENU_TOGGLE_ATTRIBUTES: Record<string, string> = { popovertarget: "main-menu" };
const MENU_POPOVER_ATTRIBUTES: Record<string, string> = { popover: "auto" };

// Link previews (WhatsApp, Slack, X, ...) read Open Graph tags, and only with absolute URLs.
// The image is rendered by tools/render_social_image.ts.
const SOCIAL_IMAGE = `${SITE}assets/social-preview.jpg`;
/** The published address of a page: "/usage.html" → ".../usage", "/spec/index.html" → ".../spec/". */
const publishedUrl = (route: string) => SITE + route.replace(/^\//, "").replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");

const currentAttribute = (route: string, currentRoute: string) => (route === currentRoute ? "page" : undefined);

export default function Layout({ title, description, currentRoute, children }: LayoutProps) {
  const specPages = listSpecPages();
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={description} />
        <title>{`${title} · blendfile`}</title>
        <link rel="canonical" href={publishedUrl(currentRoute)} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="blendfile" />
        <meta property="og:title" content={`${title} · blendfile`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={publishedUrl(currentRoute)} />
        <meta property="og:image" content={SOCIAL_IMAGE} />
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="blendfile: read Blender .blend files anywhere, with a 3D view of a scene" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${title} · blendfile`} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={SOCIAL_IMAGE} />
        <meta name="theme-color" content="#f5792a" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="stylesheet" href="/assets/vendor/ui.css" />
        <link rel="stylesheet" href="/assets/vendor/tangerine.css" />
        <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
        <link rel="stylesheet" href="/assets/site.css" />
      </head>
      <body>
        <nav class="navbar" data-collapse="md" data-position="sticky" aria-label="Main">
          <div class="navbar-start">
            <button class="btn navbar-toggle" data-variant="ghost" data-size="icon" {...MENU_TOGGLE_ATTRIBUTES} aria-label="Menu">☰</button>
            <a class="navbar-brand" href="/"><img src="/assets/icon.svg" alt="" width="28" height="28" />blendfile</a>
          </div>
          <div class="navbar-center">
            <div class="navbar-collapse" id="main-menu" {...MENU_POPOVER_ATTRIBUTES}>
              <ul class="navbar-menu">
                {PRIMARY_LINKS.map((link) => (
                  <li key={link.route}>
                    <a href={link.route} aria-current={currentAttribute(link.route, currentRoute) ?? (link.route === "/spec/index.html" && currentRoute.startsWith("/spec/") ? "page" : undefined)}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div class="navbar-end">
            <ThemeToggle />
          </div>
        </nav>
        <div class="site-shell">
          <nav class="mk-docs-navigation" aria-label="Documentation">
            <p class="mk-docs-navigation-heading">Guides</p>
            <ul>
              {GUIDE_LINKS.map((link) => (
                <li key={link.route}><a href={link.route} aria-current={currentAttribute(link.route, currentRoute)}>{link.label}</a></li>
              ))}
            </ul>
            <details open>
              <summary class="mk-docs-navigation-heading">Specification</summary>
              <ul>
                {specPages.map((page) => (
                  <li key={page.slug}><a href={page.route} aria-current={currentAttribute(page.route, currentRoute)}>{page.title}</a></li>
                ))}
              </ul>
            </details>
          </nav>
          <main id="content">{children}</main>
        </div>
        <script type="module" src="/assets/vendor/core.min.js"></script>
        {UI_SCRIPTS.map((component) => <script type="module" src={`/assets/vendor/${component}.min.js`} key={component}></script>)}
      </body>
    </html>
  );
}
