/**
 * Scroll reveal, in about thirty lines.
 *
 * Any element marked `data-reveal` or `data-reveal-stagger` gets `data-inview`
 * the first time it enters the viewport; the transition itself lives in CSS.
 * A single observer watches every element rather than one per component, and
 * elements are unobserved once revealed, so nothing accumulates.
 *
 * framer-motion is already a dependency and stays available for component-level
 * animation, but a whole-page scroll effect does not need a React render per
 * element — this costs no re-renders at all.
 *
 * Under prefers-reduced-motion nothing is observed and the CSS leaves every
 * element at its final state, so content is never hidden from someone who has
 * asked for less movement.
 */
const REVEAL_SELECTOR = "[data-reveal], [data-reveal-stagger]";

export function startRevealOnScroll(): () => void {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-inview", "");
        observer.unobserve(entry.target);
      }
    },
    // Reveal slightly before the element is fully on screen, so the motion is
    // finishing as the reader arrives rather than starting.
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
  );

  // Only now, with a live observer, is it safe for the CSS to hide anything.
  document.documentElement.classList.add("ni-reveal-ready");

  const observeAll = () => {
    document.querySelectorAll(REVEAL_SELECTOR).forEach((node) => {
      if (!node.hasAttribute("data-inview")) observer.observe(node);
    });
  };
  observeAll();

  // Anything already on screen at first paint is revealed immediately rather
  // than waiting for a scroll that may never come on a short page.
  // Re-scan on the next frame when the tab is visible, and on load regardless.
  if (document.visibilityState === "visible") requestAnimationFrame(observeAll);
  window.addEventListener("load", observeAll, { once: true });
  document.addEventListener("visibilitychange", observeAll);

  // Last-resort safety net: if for any reason an element is still unrevealed
  // after a few seconds, show it. A missed animation is a cosmetic loss; hidden
  // content is a broken page.
  window.setTimeout(() => {
    document.querySelectorAll(REVEAL_SELECTOR).forEach((node) => node.setAttribute("data-inview", ""));
  }, 4000);

  // Routes swap without a page load, so newly mounted sections are picked up too.
  const mutations = new MutationObserver(observeAll);
  mutations.observe(document.body, { childList: true, subtree: true });

  return () => { observer.disconnect(); mutations.disconnect(); };
}

/**
 * Adds `data-scrolled` to the site header once the page has left the top, which
 * is what turns the glass navigation solid.
 */
export function startHeaderScrollState(): () => void {
  if (typeof window === "undefined") return () => {};
  const apply = () => {
    const scrolled = window.scrollY > 12;
    document.querySelectorAll(".site-header").forEach((header) => {
      if (scrolled) header.setAttribute("data-scrolled", "");
      else header.removeAttribute("data-scrolled");
    });
  };
  apply();
  window.addEventListener("scroll", apply, { passive: true });
  return () => window.removeEventListener("scroll", apply);
}
