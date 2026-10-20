// The frame every page component renders into: <head>, the top bar, the side navigation, the content column and the
// defuss-shadcn scripts. Server only, like everything in lib/.
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
}

export function PageShell({ title, description, route, children }: PageShellProps) {
  return (
    <html lang="en">
      <Head title={title} description={description} route={route} />
      <body>
        <Navbar route={route} />
        <div class="site-shell">
          <DocsNavigation route={route} />
          <main id="content">{children}</main>
        </div>
        <script type="module" src="/assets/vendor/core.min.js"></script>
        {UI_SCRIPTS.map((component) => <script type="module" src={`/assets/vendor/${component}.min.js`} key={component}></script>)}
      </body>
    </html>
  );
}
