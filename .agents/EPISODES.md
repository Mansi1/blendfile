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
