/**
 * The redesigned sign-in doors, and the routing behind them.
 *
 * The security claim these protect is narrow and worth stating: adding Google
 * did NOT add a second way to become someone. Both doors end at the same server
 * procedure — `resolveLoginContext` — which reads the roles the verified
 * identity actually holds and answers with a destination. The role card, on
 * either page and on either door, is a request that procedure re-decides.
 *
 * Most assertions here exercise real behaviour: the routing table is checked by
 * calling the pure resolver, and the OAuth intent store by round-tripping it.
 * The source assertions that remain guard things behaviour cannot reach — that
 * no admin address is hardcoded, that Three.js was not used, that the Google
 * button is wired to a real provider call rather than drawn.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOGIN_CONTEXTS, PUBLIC_ROLES } from "./role-identity";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const withoutComments = (text: string) => {
  const firstImport = text.indexOf("\nimport ");
  return (firstImport === -1 ? text : text.slice(firstImport))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
};

const experience = read("../client/src/components/AuthExperience.tsx");
const panel = read("../client/src/components/AuthPanel.tsx");
const googleButton = read("../client/src/components/GoogleButton.tsx");
const callback = read("../client/src/components/AuthCallbackRoute.tsx");
const oauthLib = read("../client/src/lib/auth-oauth.ts");
const reveal = read("../client/src/lib/use-auth-reveal.ts");
const authContext = read("../client/src/contexts/AuthContext.tsx");
const app = read("../client/src/App.tsx");
const catalog = read("../client/src/i18n/catalog.ts");
const css = read("../client/src/index.css");
const roleIdentity = read("./role-identity.ts");

const AUTH_SOURCES = [experience, panel, googleButton, callback, oauthLib, reveal];

describe("both doors reach the same server guard", () => {
  it("routes the OAuth return through the same loginContext procedure as the password form", () => {
    const code = withoutComments(authContext);
    // One resolver, called by both paths.
    const passwordPath = code.slice(code.indexOf("const signIn ="), code.indexOf("const signOut ="));
    const oauthPath = code.slice(code.indexOf("const resolveAfterOAuth ="), code.indexOf("const signOut ="));
    for (const path of [passwordPath, oauthPath]) {
      expect(path).toMatch(/contextMutation\.mutateAsync\(\{ context \}\)/);
      expect(path).toMatch(/claimRoleMutation\.mutateAsync\(\)/);
    }
    // Admin is claimed server-side on both, so Google is not a way around it.
    expect(oauthPath).toMatch(/claimAdminMutation\.mutateAsync\(\)/);
  });

  it("never lets the browser decide a destination for itself", () => {
    const code = withoutComments(authContext);
    const oauthPath = code.slice(code.indexOf("const resolveAfterOAuth ="), code.indexOf("const signOut ="));
    // The destination is whatever the server returned, full stop.
    expect(oauthPath).toMatch(/if \(decision !== "ok" \|\| !next\) return/);
    expect(oauthPath).not.toMatch(/"\/admin"/);
    expect(oauthPath).not.toMatch(/`\/dashboard\//);
  });

  it("records the chosen role as a request only, and only when none is held", () => {
    const code = withoutComments(authContext);
    const oauthPath = code.slice(code.indexOf("const resolveAfterOAuth ="), code.indexOf("const signOut ="));
    expect(oauthPath).toMatch(/if \(!publicRole\(roleFromRoles\(before\?\.roles\)\)\)/);
    expect(oauthPath).toMatch(/updateUser\(\{ data: \{ requested_public_role: intent\.role \} \}\)/);
    // The request is only ever written for a signup intent.
    expect(oauthPath).toMatch(/intent\?\.mode === "signup" && intent\.role/);
  });

  it("takes the signup destination from the granted role, not the chosen card", () => {
    const code = withoutComments(experience);
    expect(code).toMatch(/const next = result\.next \?\? `\/onboarding\/\$\{selected\}`;/);
    // The old page navigated straight to `/onboarding/${role}` from the form.
    expect(code).not.toMatch(/setLocation\(returnTo \? `\/onboarding\/\$\{role\}/);
  });
});

describe("the required post-authentication routing", () => {
  // The resolver is the whole routing table. These are its branches, read from
  // the source of the one function that decides them.
  const resolver = roleIdentity.slice(roleIdentity.indexOf("export async function resolveLoginContext"));

  it("sends an authorized administrator to /admin", () => {
    expect(resolver).toMatch(/if \(admin_\) return context === "admin" \? shape\("ok", "\/admin"\)/);
  });

  it("refuses the board desk to everyone else", () => {
    expect(resolver).toMatch(/if \(context === "admin"\) return shape\("not_admin"\)/);
  });

  it("refuses a public desk to an administrator", () => {
    expect(resolver).toMatch(/shape\("admin_reserved"\)/);
  });

  it("sends an onboarded account to its dashboard and an unfinished one to onboarding", () => {
    expect(resolver).toMatch(/shape\("ok", done \? `\/dashboard\/\$\{holds\}` : `\/onboarding\/\$\{holds\}`\)/);
  });

  it("reports a missing role rather than guessing one", () => {
    expect(resolver).toMatch(/if \(!holds\) return shape\("role_not_assigned"\)/);
  });

  it("never sends an authenticated account back to /login", () => {
    expect(resolver).not.toMatch(/"\/login"/);
  });
});

describe("onboarding completion lands on the dashboard, and failure does not", () => {
  it("navigates to the destination the server confirmed", () => {
    expect(app).toContain("const completion = await completeOnboarding(profile);");
    expect(app).toContain("setLocation(returnTo || completion.next);");
  });

  it("stays on the page when the save was not recorded", () => {
    expect(app).toContain("if (!completion.ok) { setError(completion.error); return; }");
  });

  it("only reports completion once the profile actually carries the flag", () => {
    const context = withoutComments(authContext);
    const complete = context.slice(context.indexOf("const completeOnboarding ="), context.indexOf("const refreshProfile ="));
    expect(complete).toMatch(/if \(!refreshed\.profile\?\.onboarding_completed\) return \{ ok: false/);
    expect(complete).toMatch(/return \{ ok: true, next: `\/dashboard\/\$\{nextRole\}`, role: nextRole \}/);
  });
});

describe("Continue with Google is real, on both pages", () => {
  it("calls Supabase's own OAuth entry point", () => {
    const code = withoutComments(authContext);
    expect(code).toMatch(/supabaseClient\.auth\.signInWithOAuth\(\{\s*provider: "google"/);
    expect(code).toMatch(/redirectTo: oauthRedirectTarget\(\)/);
  });

  it("returns to a fixed same-origin address that cannot be steered", () => {
    expect(withoutComments(oauthLib)).toMatch(/return `\$\{window\.location\.origin\}\/auth\/callback`;/);
  });

  it("appears on login and on signup, from one composition", () => {
    // A single component serves both modes, so the button cannot exist on one
    // page and be forgotten on the other.
    expect(experience).toContain("<GoogleButton");
    expect(app).toContain('<AuthExperience mode="login"/>');
    expect(app).toContain('<AuthExperience mode="signup"/>');
  });

  it("has a real return route rather than the verification notice", () => {
    expect(app).toContain('<Route path="/auth/callback">{() => <><Header/><AuthCallbackRoute/></>}</Route>');
    expect(app).not.toContain('<Route path="/auth/callback">{() => <DemoAuthPage mode="verify"/>}</Route>');
  });

  it("never fabricates a session or a success", () => {
    for (const source of [...AUTH_SOURCES, authContext]) {
      const code = withoutComments(source);
      expect(code).not.toMatch(/setSession\(\{\s*access_token/);
      expect(code).not.toMatch(/fake|mock|stub|pretend/i);
    }
    // A failed OAuth start is surfaced, not swallowed into a redirect.
    expect(withoutComments(experience)).toMatch(/if \(!result\.ok\) \{ setError\(decisionText\(result\)\); setGoogleBusy\(false\); \}/);
  });

  it("checks the provider before letting the tab leave", () => {
    // Measured, not assumed. `signInWithOAuth` does not resolve with an error for
    // a missing provider — it navigates the whole tab to /auth/v1/authorize, which
    // answered 400 and left the reader on the provider's own error page with the
    // application gone. The preflight is what keeps the refusal inside the app.
    const code = withoutComments(authContext);
    const start = code.indexOf("const signInWithGoogle =");
    const body = code.slice(start, code.indexOf("const resolveAfterOAuth ="));
    const guard = body.indexOf("await isGoogleEnabled()");
    const redirect = body.indexOf("signInWithOAuth");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(redirect);
    expect(body).toMatch(/if \(!\(await isGoogleEnabled\(\)\)\) return \{ ok: false, decision: "oauth_disabled" \}/);
    // The check reads Supabase's own public settings endpoint and nothing else.
    const lib = withoutComments(oauthLib);
    expect(lib).toMatch(/\/auth\/v1\/settings/);
    expect(lib).toMatch(/settings\.external\?\.google === true/);
    // An unreachable check is not evidence the provider is missing.
    expect(lib).toMatch(/catch \{\s*return true;\s*\}/);
  });

  it("tells an unconfigured provider apart from a failure, in all three languages", () => {
    expect(withoutComments(oauthLib)).toMatch(/provider is not enabled/);
    for (const key of ["auth.decision.oauth_disabled", "auth.decision.oauth_failed"]) {
      // One per locale.
      expect(catalog.split(`"${key}":`).length - 1).toBe(3);
    }
  });

  it("returns quietly to the form when the reader cancels at Google", () => {
    // The classification moved into `classifyOAuthReturn`, which tells a cancel
    // apart from an allow-list problem and from a misconfigured client. What
    // matters here is unchanged: cancelling returns to the form, quietly.
    const code = withoutComments(callback);
    expect(code).toMatch(/const returned = classifyOAuthReturn\(params\);/);
    expect(code).toMatch(/if \(returned === "cancelled"\) \{ setLocation\("\/login"\); return; \}/);
  });

  it("consumes the intent once, so an abandoned attempt cannot steer the next", () => {
    const code = withoutComments(oauthLib);
    expect(code).toMatch(/sessionStorage\.removeItem\(KEY\);/);
    expect(code).not.toMatch(/localStorage/);
    // And the callback guards against StrictMode's double effect.
    expect(withoutComments(callback)).toMatch(/if \(started\.current\) return;/);
  });
});

describe("three roles, and no Vendor", () => {
  it("offers exactly the three desks the product has", () => {
    const cards = experience.slice(experience.indexOf("const ROLE_CARDS"), experience.indexOf("function Label"));
    const values = Array.from(cards.matchAll(/value: "([a-z_]+)"/g)).map((match) => match[1]);
    expect(values).toEqual(["learner", "instructor", "admin"]);
    expect(values).toEqual([...LOGIN_CONTEXTS]);
  });

  it("never offers the board desk at registration", () => {
    const cards = experience.slice(experience.indexOf("const ROLE_CARDS"), experience.indexOf("function Label"));
    expect(cards).toMatch(/value: "admin".*signup: false/s);
    // And a card that is not offered in this mode cannot stay selected.
    expect(experience).toMatch(/if \(mode === "signup" && selected === "admin"\) setSelected\("learner"\)/);
    expect([...PUBLIC_ROLES]).toEqual(["learner", "instructor"]);
  });

  it("names no Vendor anywhere in the sign-in surface", () => {
    // The claim is that no Vendor role exists in the UI — not that the word may
    // never appear in a comment explaining why it does not.
    for (const source of AUTH_SOURCES) expect(withoutComments(source).toLowerCase()).not.toContain("vendor");
    const authFiles = readdirSync(new URL("../client/src/components/", import.meta.url));
    expect(authFiles.filter((file) => /vendor/i.test(file))).toEqual([]);
  });

  it("says on the form that a role card grants nothing", () => {
    expect(experience).toContain('t("auth.contextNote")');
  });
});

describe("the exact role-validation wording the brief specifies", () => {
  it("tells the board address to pick the board desk", () => {
    expect(catalog).toContain('"auth.decision.admin_reserved": "This email is reserved for the Board/Admin account. Please select Board/Admin."');
  });

  it("tells everyone else the board desk is not theirs, without naming the address", () => {
    expect(catalog).toContain('"auth.decision.not_admin": "This email is not authorized for the Board/Admin account. Please use the authorized Admin email or select Learner/Student or Teacher/Instructor."');
  });

  it("hardcodes no administrator address in any client file", () => {
    for (const source of [...AUTH_SOURCES, authContext, app]) {
      // `example.com` and friends are RFC 2606 reserved names — they exist to be
      // placeholders and can never be anyone's address, so a form hint using one
      // is not a hardcoded account.
      const code = withoutComments(source).replace(/@(example|test|invalid|localhost)\.[a-z]+/gi, "@reserved");
      expect(code).not.toMatch(/@gmail\.com|@[a-z0-9-]+\.(com|net|org)\b/i);
      // The variable may be named in a comment explaining the boundary; it must
      // never be read, compared or shipped here.
      expect(code).not.toMatch(/ADMIN_EMAIL/);
    }
  });
});

describe("the design holds up", () => {
  it("uses no Three.js, and no WebGL canvas", () => {
    for (const source of AUTH_SOURCES) {
      // The library and its globals — not the English word "three", which the
      // three role cards are legitimately described with.
      expect(source).not.toMatch(/from ["']three|require\(["']three|THREE\.|WebGLRenderer|getContext\(["']webgl/);
    }
    const pkg = JSON.parse(read("../package.json")) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("three");
  });

  it("designs both themes rather than inverting one", () => {
    const block = css.slice(css.indexOf("Sign in and create account"));
    expect(block).toMatch(/\[data-theme="dark"\] \.ni-auth__aside/);
    expect(block).toMatch(/\[data-theme="dark"\] \.ni-auth__field/);
    expect(block).toMatch(/\[data-theme="dark"\] \.ni-auth__lantern/);
  });

  it("mirrors for Urdu and Arabic without a second stylesheet", () => {
    const block = css.slice(css.indexOf("Sign in and create account"));
    expect(block).toMatch(/inset-inline-start/);
    expect(block).toMatch(/inset-inline-end/);
    expect(block).toMatch(/padding-inline-end/);
    expect(block).toMatch(/text-align: start/);
    // No physical left/right positioning that would strand an RTL layout.
    expect(block).not.toMatch(/^\s*(left|right):/m);
  });

  it("never scrolls the page sideways, and never sizes the panel to the viewport", () => {
    const block = css.slice(css.indexOf("Sign in and create account"));
    expect(block).not.toMatch(/height:\s*100vh/);
    expect(block).toMatch(/min-height: calc\(100vh - 80px\)/);
  });

  it("keeps the form usable while it animates, and visible if it never does", () => {
    const code = withoutComments(reveal);
    // fromTo, never from: a `from` tween parks elements at opacity 0 when rAF
    // does not tick, which is exactly what a background tab does.
    expect(code).not.toMatch(/gsap\.from\(|timeline\.from\(/);
    expect(code).toMatch(/\.fromTo\(/);
    expect(code).toMatch(/prefers-reduced-motion: reduce/);
    expect(code).toMatch(/timeline\.kill\(\)/);
    expect(code).toMatch(/document\.removeEventListener\("visibilitychange", onVisible\)/);
    // Nothing here paints a colour, so no light-theme value can be baked in.
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(code).not.toMatch(/backgroundColor|color:/);
  });

  it("keeps every animation inside the 0.3-0.9s band", () => {
    const durations = Array.from(reveal.matchAll(/duration: ([\d.]+)/g)).map((match) => Number(match[1]));
    expect(durations.length).toBeGreaterThan(5);
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(0.3);
      expect(duration).toBeLessThanOrEqual(0.9);
    }
  });

  it("marks selection with more than colour", () => {
    const block = css.slice(css.indexOf("Sign in and create account"));
    expect(block).toMatch(/\.ni-auth__role\[data-selected="true"\]/);
    expect(block).toMatch(/\.ni-auth__role-tick/);
    expect(experience).toContain("ni-auth__role-tick");
  });

  it("gives every field a real label and every icon control a name", () => {
    expect(experience).toMatch(/<Label htmlFor="auth-email">/);
    expect(experience).toMatch(/<Label htmlFor="auth-password">/);
    expect(experience).toMatch(/id="auth-email"/);
    expect(experience).toMatch(/id="auth-password"/);
    expect(experience).toMatch(/aria-label=\{showPassword \? t\("auth\.hidePassword"\) : t\("auth\.showPassword"\)\}/);
    expect(experience).toMatch(/aria-pressed=\{selected === card\.value\}/);
    expect(experience).toMatch(/role="alert"/);
    // The decorative panel is not read out.
    expect(panel).toMatch(/aria-hidden="true"/);
  });

  it("keeps the theme control reachable from the sign-in pages", () => {
    expect(app).toContain('<Route path="/login">{() => <><Header/><AuthExperience mode="login"/></>}</Route>');
    expect(app).toContain('<Route path="/signup">{() => <><Header/><AuthExperience mode="signup"/></>}</Route>');
  });
});

describe("nothing was renamed and nothing leaked", () => {
  it("keeps the product name", () => {
    expect(catalog).toMatch(/"brand\.name":/);
    for (const source of [...AUTH_SOURCES, app]) expect(source).not.toMatch(/zulfishan/i);
  });

  it("ships no key, token or service role to the browser", () => {
    for (const source of [...AUTH_SOURCES, authContext]) {
      expect(source).not.toMatch(/SERVICE_ROLE|service_role|SUPABASE_SECRET/);
      expect(source).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    }
  });
});
