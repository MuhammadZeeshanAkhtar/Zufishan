import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resultState, resultError, resultRows } from "../client/src/lib/result-state";

const renderer = readFileSync(new URL("../client/src/components/ResultState.tsx", import.meta.url), "utf8");
const banner = readFileSync(new URL("../client/src/components/OfflineBanner.tsx", import.meta.url), "utf8");
const chrome = readFileSync(new URL("../client/src/components/DashboardChrome.tsx", import.meta.url), "utf8");
const online = readFileSync(new URL("../client/src/lib/use-online-status.ts", import.meta.url), "utf8");

const q = (over: Record<string, unknown>) => ({ isLoading: false, isError: false, ...over }) as never;

describe("one derivation of panel state, so the discovery bug cannot recur", () => {
  it("treats a handled ok:false as a failure, never as empty", () => {
    // This exact shape — a successful request carrying { ok:false } — is what made a broken
    // marketplace render as "0 approved instructors".
    expect(resultState(q({ data: { ok: false, error: "boom", code: "VALIDATION" } }))).toBe("error");
    expect(resultState(q({ data: { ok: false, error: "no", code: "FORBIDDEN" } }))).toBe("forbidden");
    expect(resultState(q({ data: { ok: false, error: "no", code: "SETUP_NEEDED" } }))).toBe("setup");
  });

  it("separates a genuinely empty list from every failure", () => {
    expect(resultState(q({ data: { ok: true, data: [] } }))).toBe("empty");
    expect(resultState(q({ data: { ok: true, data: [{ id: 1 }] } }))).toBe("ready");
  });

  it("blames the connection, not the server, when the browser is offline", () => {
    expect(resultState(q({ isError: true }), false)).toBe("offline");
    expect(resultState(q({ isError: true }), true)).toBe("error");
    expect(resultState(q({ data: undefined }), false)).toBe("offline");
  });

  it("reports loading before anything else", () => {
    expect(resultState(q({ isLoading: true, isError: true }))).toBe("loading");
  });

  it("never returns a success payload as an error message", () => {
    expect(resultError(q({ data: { ok: true, data: [1] } }))).toBeUndefined();
    expect(resultError(q({ data: { ok: false, error: "the real reason" } }))).toBe("the real reason");
  });

  it("never throws reading rows off a failure envelope", () => {
    expect(resultRows(q({ data: { ok: false, error: "x" } }))).toEqual([]);
    expect(resultRows(q({ data: { ok: true, data: [{ a: 1 }] } }))).toEqual([{ a: 1 }]);
  });
});

describe("each state is rendered with its own meaning", () => {
  it("marks failures as alerts and loading as a polite live region", () => {
    expect(renderer).toContain('role={state === "error" || state === "forbidden" ? "alert" : undefined}');
    expect(renderer).toContain('aria-live={state === "loading" ? "polite" : undefined}');
  });

  it("offers retry only where retrying can help", () => {
    // Retrying a refusal or a misconfiguration just repeats it.
    expect(renderer).toContain('const canRetry = Boolean(onRetry) && (state === "offline" || state === "error");');
  });

  it("covers every state the derivation can produce", () => {
    for (const state of ["loading", "offline", "forbidden", "setup", "error", "empty"]) {
      expect(renderer, `${state} needs a tone`).toContain(`${state}:`);
    }
  });
});

describe("offline is surfaced once, globally", () => {
  it("shows only while offline and cannot be dismissed", () => {
    expect(banner).toContain("if (online) return null;");
    // No dismiss control in the markup — the prose explains why, so match code, not comments.
    const markup = banner.slice(banner.indexOf("return ("));
    expect(markup).not.toMatch(/<button|onClose|setDismissed/);
  });

  it("is mounted in the dashboard chrome", () => {
    expect(chrome).toContain("<OfflineBanner />");
  });

  it("re-reads on visibility change, since events are missed in hidden tabs", () => {
    expect(online).toContain('document.addEventListener("visibilitychange", onVisible)');
    expect(online).toContain('window.addEventListener("offline", goOffline)');
  });

  it("never blocks a request pre-emptively — it only explains a failure", () => {
    expect(online).toContain("never to pre-emptively block a request");
  });
});
