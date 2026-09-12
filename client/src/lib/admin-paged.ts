/**
 * State derivation for the admin desk's paged lists.
 *
 * `resultState` was built for procedures that answer with an array, and it treats
 * any non-array payload as "ready". Every admin list answers with
 * `{ rows, total, limit, offset }` instead, because a table needs a total it can
 * page against — so a successful response holding zero rows would render as
 * "ready" with nothing in it, which is exactly the failure-as-empty confusion
 * the shared state layer exists to prevent.
 *
 * This wraps it rather than replacing it: loading, offline, forbidden, setup and
 * error all still come from one implementation, and only the definition of
 * "empty" is extended to understand a page envelope.
 */
import { resultState, type QueryLike, type ResultState } from "./result-state";

export type Paged<T> = { rows: T[]; total: number; limit: number; offset: number };

export function pagedState<T>(query: QueryLike<Paged<T>>, online = true): ResultState {
  const state = resultState(query as never, online);
  if (state !== "ready") return state;
  const payload = query.data;
  const rows = payload?.ok ? payload.data?.rows : undefined;
  return Array.isArray(rows) && rows.length === 0 ? "empty" : state;
}

/** Rows from a successful page, or an empty array. Never throws on a failure envelope. */
export function pagedRows<T>(query: QueryLike<Paged<T>>): T[] {
  const payload = query.data;
  return payload?.ok && Array.isArray(payload.data?.rows) ? payload.data.rows : [];
}

/** The page envelope itself, when the request succeeded. */
export function pagedMeta<T>(query: QueryLike<Paged<T>>): { total: number; limit: number; offset: number } {
  const payload = query.data;
  if (payload?.ok && payload.data) {
    return { total: payload.data.total, limit: payload.data.limit, offset: payload.data.offset };
  }
  return { total: 0, limit: 25, offset: 0 };
}

/** An object payload from a successful envelope, or null. */
export function objectData<T>(query: QueryLike<T>): T | null {
  const payload = query.data;
  return payload?.ok ? (payload.data as T) : null;
}
