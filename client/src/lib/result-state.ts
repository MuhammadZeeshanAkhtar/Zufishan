/**
 * One vocabulary for "what is this panel currently showing?".
 *
 * Every server procedure in this project answers with the same envelope — `{ ok: true, data }` or
 * `{ ok: false, error, code }` — but each screen was interpreting it slightly differently, and the
 * tutor-discovery bug came directly from that: a handled `ok: false` arrives over a *successful*
 * request, so react-query's `isError` stays false and the screen fell through to its empty state.
 * A failed search looked exactly like an empty marketplace.
 *
 * Deriving the state in one place makes that class of mistake impossible to repeat, and gives every
 * screen the same set: loading · offline · forbidden · setup · error · empty · ready.
 */

export type ResultState = "loading" | "offline" | "forbidden" | "setup" | "error" | "empty" | "ready";

/** The envelope shape every procedure returns. */
export type Envelope<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

export type QueryLike<T = unknown> = {
  isLoading: boolean;
  isError: boolean;
  data?: Envelope<T>;
  /** react-query's own network-failure signal, when the request never reached the server. */
  failureReason?: unknown;
};

/** True when the value is an array with nothing in it — the only honest "empty". */
const isEmptyList = (value: unknown) => Array.isArray(value) && value.length === 0;

/**
 * Maps a query to the state a panel should render.
 *
 * `online` is passed in rather than read here so the caller can decide what "offline" means for a
 * given surface — a cached list may still be worth showing while the connection is down.
 */
export function resultState<T>(query: QueryLike<T>, online = true): ResultState {
  if (query.isLoading) return "loading";

  // A transport failure while the browser is offline is a connection problem, not a server fault,
  // and telling someone their data failed to load is misleading when their wifi simply dropped.
  if (query.isError && !online) return "offline";
  if (query.isError) return "error";

  const payload = query.data;
  if (!payload) return online ? "error" : "offline";

  if (!payload.ok) {
    if (payload.code === "FORBIDDEN") return "forbidden";
    if (payload.code === "SETUP_NEEDED") return "setup";
    return "error";
  }

  return isEmptyList(payload.data) ? "empty" : "ready";
}

/** The failure message from an envelope, when there is one. Never returns a success payload. */
export function resultError(query: QueryLike): string | undefined {
  if (query.data && !query.data.ok) return query.data.error;
  return undefined;
}

/** Rows from a successful envelope, or an empty array. Never throws on a failure envelope. */
export function resultRows<T = Record<string, unknown>>(query: QueryLike<T[]>): T[] {
  return query.data?.ok && Array.isArray(query.data.data) ? query.data.data : [];
}
