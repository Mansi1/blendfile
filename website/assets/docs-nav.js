// Marks the Docs side navigation link of the section in view (aria-current="location"), as on the audio-tag site.
// VERIFIED: the section in view is the last linked heading above 30% of the viewport; an IntersectionObserver marks
// whichever entry fires last when several cross at once, which is not always the one in view.
// Loaded on every page and re-reading the links on each pass, because defuss-ssg's client navigation swaps the body in
// place without running page scripts again.
const READING_LINE = 0.3;

function markSectionInView() {
  const navigation = document.querySelector(".mk-docs-navigation");
  if (!navigation) return;
  const links = [...navigation.querySelectorAll('a[href*="#"]')];
  const line = innerHeight * READING_LINE;
  let current;
  for (const link of links) {
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (target && target.getBoundingClientRect().top <= line) current = link;
  }
  current ??= links[0];
  for (const link of links) {
    if (link === current) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
  // The navigation scrolls on its own (all spec chapters); keep the marked link inside its visible part.
  if (current && (current.offsetTop < navigation.scrollTop || current.offsetTop > navigation.scrollTop + navigation.clientHeight - current.offsetHeight)) {
    navigation.scrollTop = current.offsetTop - navigation.clientHeight / 2;
  }
}

let queued = false;
const queueMark = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    markSectionInView();
  });
};
addEventListener("scroll", queueMark, { passive: true });
addEventListener("resize", queueMark, { passive: true });
addEventListener("hashchange", queueMark);
new MutationObserver(queueMark).observe(document.body, { childList: true });
markSectionInView();
