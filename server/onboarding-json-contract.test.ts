import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertJsonResponse, NonJsonApiResponseError } from "../client/src/lib/api-response";

const main = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");
const stray = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
/** The file without its doc comment, which quotes the catch-all it removed. */
const strayCode = stray.slice(stray.indexOf("*/") + 2);
const core = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };

/** A Response with a given content type, as the browser would hand one to the fetch seam. */
const reply = (body: string | null, contentType: string, status = 200) =>
  // A 204 may not carry a body, so the body is nulled for statuses that forbid one.
  new Response(status === 204 || status === 205 ? null : body, { status, headers: contentType ? { "content-type": contentType } : {} });

describe("an HTML reply is detected instead of crashing the parser", () => {
  it("throws a readable error rather than letting JSON.parse see a document", () => {
    const html = '<!DOCTYPE html>\n<html lang="en"><head><title>App</title></head><body></body></html>';
    expect(() => assertJsonResponse(reply(html, "text/html; charset=UTF-8"), "/api/trpc/supabaseCore.updateProfile"))
      .toThrow(NonJsonApiResponseError);

    try {
      assertJsonResponse(reply(html, "text/html"), "/api/trpc/supabaseCore.updateProfile");
    } catch (error) {
      const failure = error as NonJsonApiResponseError;
      // The message a person sees must name the problem, not the parser's confusion.
      expect(failure.message).not.toContain("Unexpected token");
      expect(failure.message).not.toContain("<");
      expect(failure.message).toContain("unexpected response");
      // And it must carry the route and status for whoever debugs it.
      expect(failure.route).toBe("/api/trpc/supabaseCore.updateProfile");
      expect(failure.status).toBe(200);
      expect(failure.contentType).toContain("text/html");
    }
  });

  it("never surfaces the HTML body, which can carry stack traces and internal paths", () => {
    const leaky = '<!DOCTYPE html><pre>Error: at C:\\Users\\secret\\server\\trpc.ts:42</pre>';
    try {
      assertJsonResponse(reply(leaky, "text/html", 500), "/api/trpc/x");
      throw new Error("should have thrown");
    } catch (error) {
      const failure = error as NonJsonApiResponseError;
      expect(failure.message).not.toContain("secret");
      expect(failure.message).not.toContain("trpc.ts");
      expect(failure.message).not.toContain("<pre>");
    }
  });

  it("says the session expired when the HTML came back as 401 or 403", () => {
    for (const status of [401, 403]) {
      try {
        assertJsonResponse(reply("<!DOCTYPE html>", "text/html", status), "/api/trpc/x");
        throw new Error("should have thrown");
      } catch (error) {
        expect((error as NonJsonApiResponseError).message).toContain("sign in again");
      }
    }
  });

  it("reports a 404 HTML page — the shape a missing API route produces on a POST", () => {
    try {
      assertJsonResponse(reply("<!DOCTYPE html><title>Error</title>", "text/html; charset=utf-8", 404), "/api/trpc/supabaseCore.updateProfile");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as NonJsonApiResponseError).status).toBe(404);
    }
  });
});

describe("real API responses still pass through untouched", () => {
  it("lets a JSON success through", () => {
    const response = reply('[{"result":{"data":{"ok":true}}}]', "application/json");
    expect(assertJsonResponse(response, "/api/trpc/supabaseCore.updateProfile")).toBe(response);
  });

  it("lets a JSON error through, so tRPC handles 401, 403 and validation itself", () => {
    for (const status of [400, 401, 403, 409, 500]) {
      const response = reply('[{"error":{"json":{"message":"Please login (10001)"}}}]', "application/json", status);
      expect(assertJsonResponse(response, "/api/trpc/x")).toBe(response);
    }
  });

  it("accepts a reply with no content-type rather than breaking empty bodies", () => {
    const response = reply("", "", 204);
    expect(assertJsonResponse(response, "/api/trpc/x")).toBe(response);
  });

  it("accepts application/json with parameters and superjson-style types", () => {
    for (const type of ["application/json; charset=utf-8", "application/json"]) {
      const response = reply("[]", type);
      expect(assertJsonResponse(response, "/api/trpc/x")).toBe(response);
    }
  });
});

describe("the guard is shared, not duplicated per screen", () => {
  it("sits in the single fetch seam the tRPC client already had", () => {
    expect(main).toContain('import { assertJsonResponse } from "./lib/api-response";');
    expect(main).toContain("return assertJsonResponse(response, input);");
    // One call site: every procedure, both onboarding flows, everything else.
    expect(main.match(/assertJsonResponse\(/g)?.length).toBe(1);
  });

  it("leaves the onboarding screens alone — no per-page workaround", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(app).not.toContain("assertJsonResponse");
    expect(app).not.toMatch(/DOCTYPE|text\/html/);
  });
});

describe("both onboarding flows go through the same procedures", () => {
  it("shares one profile-update path, so one fix covers both roles", () => {
    expect(routers).toContain("updateProfile: supabaseOnlyProcedure");
    expect(routers).toContain("updateLearnerProfile: supabaseOnlyProcedure");
    expect(routers).toContain("updateInstructorProfile: supabaseOnlyProcedure");
  });

  it("mounts the API where the client asks for it", () => {
    expect(core).toContain('"/api/trpc"');
    expect(core).toContain("createExpressMiddleware({");
    expect(main).toContain('url: "/api/trpc"');
  });
});

describe("the scaffold server can no longer be started by mistake", () => {
  it("refuses to run and points at the real entry point", () => {
    expect(stray).toContain("process.exit(1);");
    expect(stray).toContain("server/_core/index.ts");
    // The trap it removes: a catch-all that answered API calls with the SPA document.
    expect(strayCode).not.toContain('app.get("*"');
    expect(strayCode).not.toContain("express.static");
  });

  it("is referenced by no script, so nothing depends on it running", () => {
    for (const script of Object.values(pkg.scripts)) {
      expect(script.includes("server/index.ts"), `"${script}" must not run the scaffold`).toBe(false);
    }
    expect(pkg.scripts.dev).toContain("server/_core/index.ts");
    expect(pkg.scripts.build).toContain("server/_core/index.ts");
  });
});
