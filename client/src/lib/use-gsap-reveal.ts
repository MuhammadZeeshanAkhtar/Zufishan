/**
 * GSAP entrance and scroll reveals for the public homepage.
 *
 * One hook, deliberately. Scattering `gsap.from(...)` through a page is how you
 * end up with orphaned ScrollTriggers that keep firing after a route change and
 * with elements parked at `opacity: 0` when a script fails. Everything here goes
 * through a single timeline registry that is torn down on unmount.
 *
 * Three rules this enforces:
 *
 *  1. **Nothing starts invisible in the markup.** Content is visible in the DOM;
 *     GSAP sets the "from" state itself, at runtime, only once it has actually
 *     run. If the bundle fails to load or the hook never mounts, the page reads
 *     normally — a broken animation must never cost someone the content.
 *  2. **Reduced motion is checked before anything is registered**, not faked
 *     with a zero duration. No timeline, no ScrollTrigger, no work at all.
 *  3. **No colour is animated.** GSAP only ever touches opacity and transform,
 *     so the theme tokens stay the single source of colour and a dark-theme
 *     reader never sees a light-theme value tween past.
 */
import { useEffect } from "react";

type RevealOptions = {
  /** Skip everything — used while a query is still loading. */
  enabled?: boolean;
};

const PREFERS_REDUCED = "(prefers-reduced-motion: reduce)";

export function useGsapReveal(rootRef: React.RefObject<HTMLElement | null>, options: RevealOptions = {}) {
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;

    let reduced = false;
    try {
      reduced = window.matchMedia(PREFERS_REDUCED).matches;
    } catch {
      reduced = false;
    }
    // Respected by doing nothing at all, rather than by running a 0s tween.
    if (reduced) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    // Loaded on demand so the homepage's first paint never waits on the
    // animation library, and so a failure to load leaves the page readable.
    void (async () => {
      let gsap: typeof import("gsap").gsap;
      let ScrollTrigger: typeof import("gsap/ScrollTrigger").ScrollTrigger;
      try {
        const core = await import("gsap");
        const trigger = await import("gsap/ScrollTrigger");
        gsap = core.gsap;
        ScrollTrigger = trigger.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);
      } catch {
        return; // Content is already visible; nothing to undo.
      }
      if (cancelled) return;

      const ctx = gsap.context(() => {
        // ---- the opening sequence: eyebrow, headline, copy, actions, visual ----
        //
        // The safety net matters here. GSAP is driven by requestAnimationFrame,
        // and a browser does not run rAF in a background tab — so a homepage
        // opened in one has its start values applied and then nothing advances
        // them. Measured in this project: 0 frames in 700ms while hidden.
        // Rather than trust the tab to be focused, the from-state is cleared
        // unconditionally if the tween has not finished, and again whenever the
        // page becomes visible. The animation is a nicety; the words are not.
        const intro = root.querySelectorAll<HTMLElement>("[data-anim='intro']");
        if (intro.length > 0) {
          gsap.from(intro, {
            opacity: 0,
            y: 18,
            duration: 0.8,
            ease: "power2.out",
            stagger: 0.09,
            clearProps: "opacity,transform",
          });
        }

        // ---- sections arrive as they are scrolled to ----
        //
        // `immediateRender: false` is the important part. A scroll-triggered
        // `gsap.from` applies its start values the moment it is CREATED, which
        // parks everything below the fold at opacity 0 and leaves it there if
        // the trigger never fires — a stalled ScrollTrigger, a hidden tab, a
        // resize that recalculates wrongly. Deferring the start values until
        // the trigger actually plays means the page is fully readable at rest
        // and can never be left blank by an animation that did not run.
        for (const section of Array.from(root.querySelectorAll<HTMLElement>("[data-anim='section']"))) {
          gsap.from(section, {
            opacity: 0,
            y: 24,
            duration: 0.9,
            ease: "power2.out",
            immediateRender: false,
            clearProps: "opacity,transform",
            scrollTrigger: { trigger: section, start: "top 84%", once: true },
          });
        }

        // ---- card grids stagger their children ----
        for (const grid of Array.from(root.querySelectorAll<HTMLElement>("[data-anim='stagger']"))) {
          const children = grid.children;
          if (children.length === 0) continue;
          gsap.from(children, {
            opacity: 0,
            y: 20,
            duration: 0.7,
            ease: "power2.out",
            stagger: 0.07,
            immediateRender: false,
            clearProps: "opacity,transform",
            scrollTrigger: { trigger: grid, start: "top 88%", once: true },
          });
        }
      }, root);

      // One teardown for every tween and every ScrollTrigger this context made.
      cleanups.push(() => ctx.revert());

      /* ------------------------------------------------------- safety net ---
         GSAP is driven by requestAnimationFrame, and a browser does not run rAF
         in a background tab. Measured in this project: zero frames in 700ms
         while hidden. A tween that has applied its start values but cannot
         advance leaves that content at `opacity: 0` — so a homepage opened in a
         background tab would be blank until it was focused.

         This sweeps any element still sitting at zero opacity and restores it.
         It runs once after the longest sequence should have finished, and again
         shortly after the page becomes visible. The animation is a nicety; the
         words are not, and they win. */
      const animated = () => Array.from(root.querySelectorAll<HTMLElement>("[data-anim], [data-anim='stagger'] > *"));
      const sweep = () => {
        const stuck = animated().filter((el) => getComputedStyle(el).opacity === "0");
        if (stuck.length > 0) gsap.set(stuck, { clearProps: "opacity,transform" });
      };

      const timer = window.setTimeout(sweep, 2200);
      const onVisible = () => { if (document.visibilityState === "visible") window.setTimeout(sweep, 1600); };
      document.addEventListener("visibilitychange", onVisible);
      cleanups.push(() => {
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
      });
    })();

    return () => {
      cancelled = true;
      for (const done of cleanups) done();
    };
  }, [rootRef, enabled]);
}
