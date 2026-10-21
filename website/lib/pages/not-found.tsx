// VERIFIED: the 404 page, like the audio-tag site's: a centered empty state that counts down and then sends the visitor to the
// overview (a meta refresh in <head>, so it works without scripts; the inline script only updates the text). Server
// only; pages/404.mdx only renders it. GitHub Pages serves it at any depth, so config.ts keeps its URLs absolute.
import { REDIRECT_SECONDS } from "../layout/head.tsx";
import { PageShell } from "../layout/page-shell.tsx";

const countdownText = (secondsLeft: number) => `Taking you back to blendfile in ${secondsLeft} ${secondsLeft === 1 ? "second" : "seconds"}.`;

// The SSR serializer escapes "&", "<" and ">" inside <script>, so this snippet avoids them.
const COUNTDOWN_SCRIPT = `var left=${REDIRECT_SECONDS};var timer=setInterval(function(){left-=1;var text=document.getElementById("countdown");if(text)text.textContent=left?"Taking you back to blendfile in "+left+(left===1?" second.":" seconds."):"Taking you back to blendfile.";if(left===0)clearInterval(timer)},1000);`;

export function NotFoundPage({ title, description }: { title: string; description: string }) {
  return (
    <PageShell title={title} description={description} route="/404.html" redirectTo="/">
      <div class="not-found">
        <section class="mk-empty-state" aria-labelledby="not-found-title">
          <h1 class="mk-empty-state-title" id="not-found-title"><img src="/assets/icon.svg" alt="" width="72" height="72" />{title}</h1>
          <p class="mk-empty-state-text">There is nothing at this address. <span id="countdown">{countdownText(REDIRECT_SECONDS)}</span></p>
          <div class="mk-empty-state-actions">
            <a class="btn" data-variant="default" href="/" data-no-nav>Back to blendfile</a>
            <a class="btn" data-variant="outline" href="/docs.html">Read the docs</a>
          </div>
        </section>
      </div>
      <script dangerouslySetInnerHTML={{ __html: COUNTDOWN_SCRIPT }} />
    </PageShell>
  );
}
