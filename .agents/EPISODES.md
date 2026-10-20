# Episodes

<!-- Newest last. The gate appends FAIL|DONE|FINDING; past 100 entries it trims only its own oldest DONE|FAIL|learned
FINDING (git keeps them). Leads (LESSON, FINDING learn=none) stay until wrap settles them; doctor fails above 30.
Agents append `<UTC ISO> s=<session> LESSON <VAE-DIALECT>` only for a falsified HYPOTHESIS, a dead end, or a root cause.
Session start injects the 3 newest open entries: LESSON, FINDING learn=none, FAIL without a later DONE.
Wrap: EVERY lead → test | .agents/VERIFY.py rule | one MEMORY line with BC, then delete; OR delete BC evidence. -->

2026-10-19T22:08:07Z s=989b2bbf FAIL docs.pages,prose,env.example,package,tests.e2e.1
2026-10-19T22:10:08Z s=989b2bbf FAIL tests.e2e.1
2026-10-19T22:16:52Z s=989b2bbf DONE fp=1bcc0bdc0d6d cov=95.1% paths=AGENTS.md,ARCH.md,CLAUDE.md,Makefile(+97)
2026-10-19T22:16:52Z s=989b2bbf FINDING tools/make_texture_fixture.py:truth / e2e/consumer.ts summarize learn=test: e2e/consumer.ts runs on every input/*.blend with a truth file, so a future fixture with a different truth shape fails make e2e again.
2026-10-19T22:16:52Z s=989b2bbf FINDING e2e/consumer.ts:fixtures loop learn=none: Fixtures are defined by having truth JSON; test/fixtures.test.ts still covers each tracked fixture's truth.
2026-10-19T22:16:52Z s=989b2bbf FINDING Makefile:vscode-package learn=none: vsce itself refuses to package without a repository field now that the flag is gone.
2026-10-19T22:16:52Z s=989b2bbf FINDING website/pages/usage.mdx:48,75,95 learn=verifier: vae prose T04 flags any future Markdown site-root link.
2026-10-19T22:24:51Z s=989b2bbf FAIL env.example
2026-10-19T22:27:52Z s=989b2bbf DONE fp=0e7970dc8f39 cov=95.1% paths=.github/workflows/pages.yml,website/ARCH.md,website/README.md,website/components/inspector.tsx(+1)
2026-10-19T22:27:52Z s=989b2bbf FINDING website/config.ts:basePlugin learn=none: Not mechanically checked in CI: the e2e suite serves the site at the root; a regression would show as broken pages only on GitHub Pages.
2026-10-19T22:29:24Z s=989b2bbf DONE fp=4c0d165ebb52 cov=95.1% paths=.github/workflows/pages.yml,website/ARCH.md,website/README.md,website/components/inspector.tsx(+1)
2026-10-19T22:35:33Z s=989b2bbf DONE fp=01ac3e257f2b cov=95.1% paths=Makefile,README.md,e2e/website.spec.ts,vscode-extension/README.md(+5)
2026-10-19T22:35:33Z s=989b2bbf FINDING website/pages/vscode.mdx:27 learn=test: e2e/website.spec.ts builds and opens every page, so an MDX parse error fails make e2e.
2026-10-19T22:54:29Z s=989b2bbf DONE fp=56debbe4dd5a cov=95.1% paths=Makefile,e2e/website.spec.ts,vscode-extension/ARCH.md,vscode-extension/media/preview.css(+10)
2026-10-19T22:54:29Z s=989b2bbf FINDING vscode-extension/src/webview/preview-app.tsx:filterDatablocks, viewer-panel.tsx outliner checkbox learn=test: e2e/website.spec.ts filters datablocks inside the shadow root.
2026-10-19T22:54:29Z s=989b2bbf FINDING vscode-extension/media/preview.css:3 learn=none: A visual regression; no pixel assertion covers border colors.
2026-10-19T22:54:29Z s=989b2bbf FINDING website/components/inspector.tsx:loadChosenFiles learn=test: The chosen-files e2e test selects two different .blend files in a row.
2026-10-19T22:54:29Z s=989b2bbf FINDING e2e/website.spec.ts:openInspector learn=test: The helper is used by every inspector test.
2026-10-19T22:57:22Z s=989b2bbf DONE fp=069ae444c013 cov=95.1% paths=skills-lock.json
2026-10-19T23:36:38Z s=989b2bbf DONE fp=5b0759a31855 cov=95.1% paths=Makefile,bun.lock,package.json,skills-lock.json(+1)
2026-10-19T23:36:38Z s=989b2bbf FINDING website/lib/layout.tsx:Layout, Makefile:website-assets learn=test: The existing Mermaid e2e test fails whenever the diagram bundle is missing.
2026-10-19T23:36:47Z s=989b2bbf DONE fp=fd3cc41bf7f6 cov=95.1% paths=Makefile,bun.lock,package.json,skills-lock.json(+2)
2026-10-20T00:02:33Z s=989b2bbf DONE fp=8a60a72f54a5 cov=95.3% paths=.github/workflows/pages.yml,Makefile,e2e/playwright.config.ts,e2e/website.spec.ts(+17)
2026-10-20T00:02:33Z s=989b2bbf FINDING website/preview.config.ts, e2e/playwright.config.ts learn=test: e2e 'page links have no .html and each one opens its own page' fails on any fallback.
2026-10-20T00:02:33Z s=989b2bbf FINDING website/config.ts:htmlFix learn=test: Playwright baseURL is /blendfile/, so a root-absolute URL fails to load.
2026-10-20T00:02:33Z s=989b2bbf FINDING website/config.ts:withoutSourceMap learn=none: Only the dev server logs it; no test reads the dev log.
2026-10-20T00:02:33Z s=989b2bbf FINDING website/dist/spec/07-special-blocks.html learn=none: Not reproduced; the per-page e2e test fails on an empty page.
2026-10-20T00:08:10Z s=989b2bbf DONE fp=cfda4de8c0db cov=95.3% paths=README.md,bun.lock,e2e/website.spec.ts,package.json(+8)
2026-10-20T00:08:10Z s=989b2bbf FINDING website/config.ts:codeHighlight learn=test: e2e 'code blocks are highlighted at build time' fails without highlighting.
2026-10-20T00:08:10Z s=989b2bbf FINDING website/assets/site.css:.mk-code-block pre learn=none: Visual only; no pixel assertion.
2026-10-20T00:08:10Z s=989b2bbf FINDING website/lib/layout.tsx:publishedUrl learn=test: e2e checks og tags on every page plus the image's type, size and dimensions.
