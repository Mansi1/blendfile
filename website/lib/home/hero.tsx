// The overview's opening: icon, the Blender 5.x pill, the headline and the two main actions.
export function Hero() {
  return (
    <section class="mk-hero" data-variant="glow">
      <div class="mk-hero-copy">
        <img class="home-hero-icon" src="/assets/icon.svg" alt="" width="88" height="88" />
        <a class="mk-hero-pill" href="/docs.html#02-file-header"><span class="badge" data-variant="default" data-size="sm">5.x</span>Reads the new 17-byte header of Blender 5.0+ →</a>
        <h1 class="mk-hero-title">Read .blend files anywhere</h1>
        <p class="mk-hero-desc">A TypeScript library for Blender files in the browser and in Node.js, with a written specification of the format it implements.</p>
        <div class="mk-hero-actions">
          <a class="btn" data-variant="default" data-size="lg" href="#playground">Open the playground</a>
          <a class="btn" data-variant="outline" data-size="lg" href="/docs.html">Use the library</a>
        </div>
      </div>
    </section>
  );
}
