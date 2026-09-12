/**
 * Guards every API response before anything tries to parse it as JSON.
 *
 * The failure this exists for: when a request reaches something that is not the API — a static-file
 * server, a single-page-app catch-all route, a proxy that lost its mapping, a login page — the reply
 * is an HTML document with a perfectly ordinary status code. The client then calls `JSON.parse` on
 * `<!doctype html>` and the person using the app is shown:
 *
 *   Unexpected token '<', "<!DOCTYPE ..." is not valid JSON
 *
 * That message describes the parser's disappointment and nothing about the actual problem. It gives
 * no route, no status, and no hint that the request never reached the API at all, so it is
 * effectively undiagnosable from a screenshot.
 *
 * This turns it into a sentence that says what happened, and logs the route and status where a
 * developer will find them. It deliberately does not read or surface the body: an HTML error page
 * can carry stack traces, internal paths and framework banners, and none of that belongs in front
 * of a user or in a bug report they paste into chat.
 *
 * It is a diagnosis, not a workaround. Nothing here parses HTML or recovers from it — a non-JSON
 * reply is still a failure, and the request still fails. It just fails legibly.
 */

/** Thrown when the API replies with something that is not JSON. */
export class NonJsonApiResponseError extends Error {
  readonly route: string;
  readonly status: number;
  readonly contentType: string;

  constructor(route: string, status: number, contentType: string) {
    super(
      status === 401 || status === 403
        ? "Your session has expired. Please sign in again."
        : `The server returned an unexpected response (HTTP ${status}). Please try again.`,
    );
    this.name = "NonJsonApiResponseError";
    this.route = route;
    this.status = status;
    this.contentType = contentType;
  }
}

/** The path of a request, without query string or origin, for logs that stay readable. */
function routeOf(input: RequestInfo | URL): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  try {
    return new URL(raw, "http://local").pathname;
  } catch {
    return String(raw).split("?")[0];
  }
}

/**
 * Passes a JSON response straight through, and converts anything else into a readable failure.
 *
 * A missing `content-type` is treated as acceptable rather than as a fault: some proxies strip it on
 * 204s and empty bodies, and rejecting those would break working requests to fix a broken one.
 */
export function assertJsonResponse(response: Response, input: RequestInfo | URL): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType || contentType.includes("json")) return response;

  const route = routeOf(input);
  // Logged for whoever is debugging; deliberately never shown to the person using the app.
  console.error("[API] expected JSON but the response was not JSON.", {
    route,
    status: response.status,
    contentType,
    hint:
      response.status === 404
        ? "The API route was not found. Check that the API server is mounted and that the request path is correct."
        : contentType.includes("html")
          ? "An HTML document came back, which usually means the request reached a page server or a single-page-app fallback instead of the API."
          : undefined,
  });

  throw new NonJsonApiResponseError(route, response.status, contentType);
}
