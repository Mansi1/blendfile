// The frame every page component renders into: <head>, the top bar, the content column and the defuss-shadcn scripts.
// VERIFIED: like the audio-tag site, the top bar and the content share one centered column (.page, 72rem), so their
// edges line up at every width; only the Docs page adds the side navigation beside its article. Server only, like everything in lib/.
import type { Props } from "defuss";
import { UI_SCRIPTS } from "../ui.ts";
import { DocsNavigation } from "./docs-navigation.tsx";
import { Head } from "./head.tsx";
import { Navbar } from "./navbar.tsx";

export interface PageShellProps extends Props {
  title: string;
  description: string;
  /** Route of the page, e.g. `/docs.html`: marks it in the navigation and gives its published address. */
  route: string;
  /** Show the side navigation of the Docs sections (the Docs page only). */
  sideNavigation?: boolean;
}

export function PageShell({ title, description, route, sideNavigation = false, children }: PageShellProps) {
  return (
    <html lang="en">
      <Head title={title} description={description} route={route} />
      <body>
        <Navbar route={route} />
        {sideNavigation ? (
          <div class="page page-docs">
            <DocsNavigation />
            <main id="content">{children}</main>
          </div>
        ) : (
          <main id="content" class="page page-main">{children}</main>
        )}
        <script type="module" src="/assets/vendor/core.min.js"></script>
        {UI_SCRIPTS.map((component) => <script type="module" src={`/assets/vendor/${component}.min.js`} key={component}></script>)}
      </body>
    </html>
  );
}
