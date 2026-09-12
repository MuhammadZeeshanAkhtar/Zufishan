/**
 * The sign-in entrance, and the two small transitions that follow it.
 *
 * Three rules shaped this, and they are the reason it is not simply a `gsap.from`
 * on everything:
 *
 *  1. **The form is usable before the animation finishes.** Nothing here gates
 *     input. The fields are in the DOM, focusable and typable from the first
 *     paint; the timeline only moves opacity and a few pixels of offset. A
 *     reader who starts typing at 40ms is never interrupted, and focus is never
 *     stolen or reset.
 *
 *  2. **Nothing is left invisible if the animation never runs.** GSAP is driven
 *     by `requestAnimationFrame`, which does not tick in a background tab. A
 *     `from()` tween applies its start values immediately, so a page opened in a
 *     background tab would paint at `opacity: 0` and stay there — a blank sign-in
 *     form. Every tween therefore runs `fromTo`, and a guard clears any residual
 *     zero-opacity state if the timeline has not completed. This exact failure
 *     was measured on the public homepage; the fix is the same one.
 *
 *  3. **`prefers-reduced-motion` means no motion at all**, not a shorter one.
 *     The elements are placed at their resting state and the timeline is never
 *     built.
 *
 * Colours are never touched here. Everything animated is opacity and transform,
 * so the theme owns every painted value and a light-theme colour can never be
 * baked into a tween.
 */
import { useEffect, type RefObject } from "react";
import { gsap } from "gsap";

/** Resting state: exactly what the CSS already specifies. */
const AT_REST = { opacity: 1, y: 0, x: 0, scale: 1, clearProps: "opacity,transform" } as const;

export function useAuthReveal(scope: RefObject<HTMLElement | null>, mode: string) {
  useEffect(() => {
    const root = scope.current;
    if (!root) return;

    const pick = (name: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-auth-anim="${name}"]`));
    const aside = Array.from(document.querySelectorAll<HTMLElement>('[data-auth-anim="aside"]'));
    const everything = [
      ...aside, ...pick("mark"), ...pick("title"), ...pick("lede"),
      ...pick("roles"), ...pick("field"), ...pick("submit"), ...pick("foot"),
    ];
    if (everything.length === 0) return;

    let reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { reduced = false; }

    if (reduced) {
      gsap.set(everything, AT_REST);
      return;
    }

    const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });

    // The panel settles first, then the form reads top to bottom. Durations sit
    // in the 0.3-0.9s band: present, but never something to wait through.
    timeline
      .fromTo(aside, { opacity: 0, scale: 1.015 }, { opacity: 1, scale: 1, duration: 0.85 }, 0)
      .fromTo(pick("mark"), { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.45 }, 0.06)
      .fromTo(pick("title"), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55 }, 0.12)
      .fromTo(pick("lede"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 }, 0.2)
      .fromTo(pick("roles"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 0.28)
      .fromTo(pick("field"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.055 }, 0.34)
      .fromTo(pick("submit"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.05 }, 0.5)
      .fromTo(pick("foot"), { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.62);

    // The safety net for rule 2. If rAF never ran — a background tab, a throttled
    // window — put everything at rest rather than leaving a blank panel behind.
    const settle = () => {
      if (timeline.progress() < 1) gsap.set(everything, AT_REST);
    };
    const timer = window.setTimeout(settle, 1600);
    const onVisible = () => { if (document.visibilityState === "visible") settle(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      timeline.kill();
      // Leave the DOM at its resting state, never mid-tween.
      gsap.set(everything, AT_REST);
    };
    // `mode` is a dependency so switching between sign in and create account
    // replays the entrance for the fields that actually changed.
  }, [scope, mode]);
}

/**
 * The one-shot confirmation before an onboarding redirect.
 *
 * Deliberately short and deliberately optional: the caller navigates when the
 * save is confirmed, whether or not this resolves. It exists so the last click
 * of onboarding acknowledges itself instead of the page simply vanishing.
 */
export function playCompletionCue(element: HTMLElement | null): Promise<void> {
  if (!element) return Promise.resolve();
  let reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { reduced = false; }
  if (reduced) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.fromTo(
      element,
      { scale: 0.94, opacity: 0.65 },
      { scale: 1, opacity: 1, duration: 0.42, ease: "back.out(1.7)", onComplete: () => resolve() },
    );
    // Never let a missed frame hold up a redirect the server already confirmed.
    window.setTimeout(resolve, 600);
  });
}
