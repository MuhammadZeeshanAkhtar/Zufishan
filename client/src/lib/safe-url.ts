/**
 * The one place a URL is built or checked in the browser.
 *
 * `new URL()` throws. That is the whole problem: a single unchecked call took
 * down the Course Builder for every instructor, because the value handed to it
 * was the literal string "undefined" — an unset environment variable that Vite
 * had inlined into a template at build time. A thrown TypeError in a React event
 * handler kills the interaction, so a missing piece of configuration presented
 * itself as "Failed to construct 'URL': Invalid URL" on a form that had nothing
 * to do with URLs.
 *
 * Nothing here throws. Every function answers with a value or a reason, so a
 * caller has to decide what to do about a bad URL instead of discovering it as a
 * crash. Four distinctions matter and are kept apart deliberately:
 *
 *   absent        an optional field left empty. Not an error — "no media".
 *   internal      a path like "/courses/x", resolved against one app base.
 *   absolute      a full http(s) URL, protocol-checked.
 *   storage_path  a private bucket key like "<uuid>/file.pdf". NOT a URL, and
 *                 never to be used as one: it must be exchanged for a signed URL
 *                 through the authorised storage procedure. Rendering it in an
 *                 `img src` fabricates a public URL that does not exist.
 *
 * The protocol allow-list is https everywhere, plus http on loopback so local
 * development works. `javascript:`, `data:`, `blob:`, `file:` and anything else
 * are rejected: an attacker-supplied `javascript:` URL in an href is script
 * execution, and this layer is where that is stopped once rather than per-field.
 */

export type UrlRejection = "malformed" | "protocol" | "no_base" | "storage_path";

export type UrlOutcome =
  | { ok: true; kind: "absent" }
  | { ok: true; kind: "internal"; path: string; href: string }
  | { ok: true; kind: "absolute"; href: string }
  | { ok: false; reason: UrlRejection };

/** Protocols that may ever appear in an href this app renders or navigates to. */
const SECURE_PROTOCOL = "https:";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** `new URL` that answers with null instead of throwing. The only call site. */
export function safeNewUrl(raw: unknown, base?: string): URL | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    return base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
}

/**
 * The origin internal paths resolve against.
 *
 * The browser's own origin is the truth in a running app; the build-time
 * variable is the fallback for non-browser contexts (tests, SSR). Returns null
 * when neither is available rather than inventing one — a fabricated base is how
 * a wrong absolute URL reaches a redirect.
 */
export function appBaseUrl(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): string | null {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  const configured = typeof env.VITE_APP_URL === "string" ? env.VITE_APP_URL.trim() : "";
  const parsed = safeNewUrl(configured);
  return parsed ? parsed.origin : null;
}

/** True for a value that is a private storage object key, not a URL. */
export function looksLikeStorageObjectPath(raw: string): boolean {
  const value = raw.trim();
  if (value === "" || value.startsWith("/") || value.startsWith("#") || value.startsWith("?")) return false;
  // A scheme means it is meant to be a URL, however malformed.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  // Bucket keys are "<segment>/<segment>…" with no host-looking first segment.
  return value.includes("/") && !value.startsWith("//");
}

function protocolAllowed(url: URL): boolean {
  if (url.protocol === SECURE_PROTOCOL) return true;
  // Plain http only on loopback, so local development is usable without opening
  // a hole for cleartext links to arbitrary hosts.
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

/**
 * Checks an optional URL field.
 *
 * Empty, null and undefined are all "absent" and succeed — an optional field
 * that was left blank is not a validation failure, and must never reach
 * `new URL`. Everything else is classified, never guessed.
 */
export function parseOptionalUrl(
  raw: unknown,
  options: { allowInternal?: boolean; base?: string | null } = {},
): UrlOutcome {
  const { allowInternal = true } = options;
  if (raw === null || raw === undefined) return { ok: true, kind: "absent" };
  if (typeof raw !== "string") return { ok: false, reason: "malformed" };

  const value = raw.trim();
  if (value === "") return { ok: true, kind: "absent" };

  // A private object key is a real value that is simply not a URL. Naming that
  // separately is what stops it being rendered as one.
  if (looksLikeStorageObjectPath(value)) return { ok: false, reason: "storage_path" };

  if (value.startsWith("/") && !value.startsWith("//")) {
    if (!allowInternal) return { ok: false, reason: "malformed" };
    const base = options.base ?? appBaseUrl();
    if (!base) return { ok: false, reason: "no_base" };
    const resolved = safeNewUrl(value, base);
    if (!resolved) return { ok: false, reason: "malformed" };
    return { ok: true, kind: "internal", path: resolved.pathname + resolved.search + resolved.hash, href: resolved.toString() };
  }

  const parsed = safeNewUrl(value);
  if (!parsed) return { ok: false, reason: "malformed" };
  if (!protocolAllowed(parsed)) return { ok: false, reason: "protocol" };
  return { ok: true, kind: "absolute", href: parsed.toString() };
}

/**
 * Resolves an internal path to a full URL, or null.
 *
 * Used for redirects and anything that needs an absolute form of an in-app
 * route. A caller that gets null has a configuration problem, not a bad path.
 */
export function resolveInternalPath(path: string, base: string | null = appBaseUrl()): string | null {
  if (!base) return null;
  const resolved = safeNewUrl(path.startsWith("/") ? path : `/${path}`, base);
  return resolved ? resolved.toString() : null;
}

/**
 * An href safe to put in the DOM, or null.
 *
 * The narrow version of `parseOptionalUrl` for the common case: give me
 * something I can render, or nothing at all.
 */
export function safeHref(raw: unknown): string | null {
  const outcome = parseOptionalUrl(raw);
  return outcome.ok && outcome.kind !== "absent" ? outcome.href : null;
}

/**
 * An image source that is genuinely displayable, or null.
 *
 * A storage object key returns null on purpose: the caller must request a signed
 * URL through the authorised storage procedure, or show its placeholder. This is
 * the rule that stops the app inventing a public URL for a private object.
 */
export function displayableImageSrc(raw: unknown): string | null {
  const outcome = parseOptionalUrl(raw);
  if (!outcome.ok || outcome.kind === "absent") return null;
  return outcome.href;
}

/** A stable key for the message shown beside a rejected field. */
export const urlRejectionKey = {
  malformed: "url.invalid",
  protocol: "url.protocol",
  no_base: "url.noBase",
  storage_path: "url.storagePath",
} as const;
