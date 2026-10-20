// <head> of every page (server only: lib/ is not hydrated): title, description, link preview tags, theme and styles.
import type { Props } from "defuss";
import { SITE } from "../site.ts";

export interface HeadProps extends Props {
  title: string;
  description: string;
  /** Route of the page, e.g. `/docs.html`, for the canonical and og:url addresses. */
  route: string;
}

// Applied before first paint so the page does not flash light in dark mode.
// The SSR serializer escapes "&", "<" and ">" inside <script>, so this snippet avoids them.
const THEME_BOOTSTRAP = `try{var theme=localStorage.getItem("theme");var dark=theme?theme==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(dark)document.documentElement.classList.add("dark")}catch(error){}`;

// Link previews (WhatsApp, Slack, X, ...) read Open Graph tags, and only with absolute URLs.
// The image is rendered by tools/render_social_image.ts.
const SOCIAL_IMAGE = `${SITE}assets/social-preview.jpg`;
/** The published address of a page: "/docs.html" → ".../docs", "/index.html" or "/" → the site itself. */
const publishedUrl = (route: string) => SITE + route.replace(/^\//, "").replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");

export function Head({ title, description, route }: HeadProps) {
  const fullTitle = `${title} · blendfile`;
  return (
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content={description} />
      <title>{fullTitle}</title>
      <link rel="canonical" href={publishedUrl(route)} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="blendfile" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={publishedUrl(route)} />
      <meta property="og:image" content={SOCIAL_IMAGE} />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="blendfile: read Blender .blend files anywhere, with a 3D view of a scene" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SOCIAL_IMAGE} />
      <meta name="theme-color" content="#f5792a" />
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      <link rel="stylesheet" href="/assets/vendor/ui.css" />
      <link rel="stylesheet" href="/assets/vendor/tangerine.css" />
      <link rel="icon" type="image/svg+xml" href="/assets/icon.svg" />
      <link rel="stylesheet" href="/assets/site.css" />
    </head>
  );
}
