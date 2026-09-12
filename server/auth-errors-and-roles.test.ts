/**
 * The three faults reported together, and what each one actually was.
 *
 *  1. "Invalid login credentials" on learner and instructor sign-in. The audit
 *     found no defect in the accounts — all three are confirmed, hold a bcrypt
 *     password, are not banned, and have signed in successfully. What WAS wrong
 *     is that the provider's own English sentence was shown verbatim for every
 *     failure, so a mistyped password, an unconfirmed address, a rate limit and
 *     a dead network were one indistinguishable string in one language. These
 *     cover the mapping that replaced it.
 *
 *  2. Google sign-in. The provider is not enabled on the project, which is an
 *     operator's configuration task; these cover that the refusal is honest and
 *     that a role conflict arriving through Google is worded for Google.
 *
 *  3. The board account reading as a learner. Migration 0027 removed the one
 *     accidental row; these cover that its delete cannot reach anything else,
 *     and that the desk would not display a public role on a privileged account
 *     even if one existed again.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authErrorCode, AUTH_ERROR_KEY, type AuthErrorCode } from "../client/src/lib/auth-errors";
import { classifyOAuthReturn } from "../client/src/lib/auth-oauth";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const withoutComments = (text: string) => {
  const firstImport = text.indexOf("\nimport ");
  return (firstImport === -1 ? text : text.slice(firstImport))
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
};

const authContext = read("../client/src/contexts/AuthContext.tsx");
const experience = read("../client/src/components/AuthExperience.tsx");
const callback = read("../client/src/components/AuthCallbackRoute.tsx");
const usersPage = read("../client/src/components/AdminUsersExperience.tsx");
const catalog = read("../client/src/i18n/catalog.ts");
const migration = read("../supabase/migrations/0027_board_account_holds_no_public_role.sql");
const oauthLib = read("../client/src/lib/auth-oauth.ts");

describe("a failure is classified, not passed through", () => {
  it("names the failure Supabase actually returns for a wrong password", () => {
    // The exact payload observed from the live project.
    expect(authErrorCode({ name: "AuthApiError", status: 400, code: "invalid_credentials", message: "Invalid login credentials" }))
      .toBe("invalid_credentials");
  });

  it("tells an unconfirmed address apart from a wrong password", () => {
    expect(authErrorCode({ code: "email_not_confirmed", message: "Email not confirmed" })).toBe("email_not_confirmed");
    expect(authErrorCode({ message: "Email not confirmed", status: 400 })).toBe("email_not_confirmed");
  });

  it("tells a rate limit apart from a credential problem", () => {
    expect(authErrorCode({ status: 429, message: "Request rate limit reached" })).toBe("rate_limited");
    expect(authErrorCode({ code: "over_request_rate_limit", message: "" })).toBe("rate_limited");
  });

  it("reports a transport failure as a transport failure", () => {
    expect(authErrorCode({ name: "TypeError", message: "Failed to fetch" })).toBe("network");
    // A proxy answering with HTML: the body cannot be parsed as JSON.
    expect(authErrorCode({ name: "SyntaxError", message: "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON" })).toBe("network");
  });

  it("recognises a provider that is not configured", () => {
    expect(authErrorCode({ status: 400, code: "validation_failed", message: "Unsupported provider: provider is not enabled" }))
      .toBe("provider_disabled");
  });

  it("never guesses: an unrecognised failure stays unrecognised", () => {
    expect(authErrorCode({ message: "something nobody has seen before" })).toBe("auth_failed");
    expect(authErrorCode(null)).toBe("auth_failed");
    expect(authErrorCode(undefined)).toBe("auth_failed");
  });

  it("does not reveal whether the address or the password was wrong", () => {
    // Supabase deliberately gives one answer for both, so the form cannot be
    // used to discover who holds an account. The wording must not undo that.
    const wording = catalog.match(/"auth\.error\.invalidCredentials": "([^"]+)"/);
    expect(wording).not.toBeNull();
    expect(wording![1]).toMatch(/email or password/i);
    expect(wording![1]).not.toMatch(/no account|not found|does not exist|unregistered/i);
  });

  it("has wording for every code, in all three languages", () => {
    const codes = Object.keys(AUTH_ERROR_KEY) as AuthErrorCode[];
    expect(codes.length).toBeGreaterThanOrEqual(9);
    for (const code of codes) {
      const key = AUTH_ERROR_KEY[code];
      expect(catalog.split(`"${key}":`).length - 1, `${key} should appear in en, ur and ar`).toBe(3);
    }
  });

  it("no longer shows the provider's raw sentence for a sign-in or sign-up failure", () => {
    const code = withoutComments(authContext);
    const signIn = code.slice(code.indexOf("const signIn ="), code.indexOf("const signOut ="));
    expect(signIn).toMatch(/if \(!signedIn\.ok\) return \{ ok: false, errorCode: signedIn\.errorCode \}/);
    expect(signIn).not.toMatch(/error: friendlyAuthError\(error\)/);
    const signUp = code.slice(code.indexOf("const signUp ="), code.indexOf("const signIn ="));
    expect(signUp).toMatch(/if \(!created\.ok\) return \{ ok: false, errorCode: created\.errorCode \}/);
    expect(signUp).not.toMatch(/error: friendlyAuthError\(error\)/);
  });

  it("survives a response that is not JSON at all", () => {
    const code = withoutComments(authContext);
    const helper = code.slice(code.indexOf("async function attemptAuth"), code.indexOf("export function SupabaseAuthProvider"));
    expect(helper).toMatch(/try \{/);
    expect(helper).toMatch(/catch \(cause\)/);
    expect(helper).toMatch(/errorCode: authErrorCode\(cause as SupabaseAuthFailure\)/);
  });

  it("renders the code, not the provider string, on both screens", () => {
    expect(withoutComments(experience)).toMatch(/if \(result\.errorCode\) return t\(AUTH_ERROR_KEY\[result\.errorCode\] as TranslationKey\)/);
    expect(withoutComments(callback)).toMatch(/if \(result\.errorCode\) \{ setFailure\(t\(AUTH_ERROR_KEY\[result\.errorCode\] as TranslationKey\)\); return; \}/);
  });
});

describe("a role conflict that arrives through Google is worded for Google", () => {
  it("carries the exact sentences the brief specifies", () => {
    expect(catalog).toContain('"auth.decision.google.already_learner": "This Google account is already registered as a Learner. Please use Learner/Student or choose another account."');
    expect(catalog).toContain('"auth.decision.google.already_instructor": "This Google account is already registered as an Instructor. Please use Ustaz/Instructor or choose another account."');
    expect(catalog).toContain('"auth.decision.google.not_admin": "This account is not authorized for the Board/Admin account. Please use the authorized Admin account or select Learner/Student or Teacher/Instructor."');
  });

  it("prefers the Google wording on the callback, and falls back when there is none", () => {
    const code = withoutComments(callback);
    const googleFirst = code.indexOf("auth.decision.google.");
    const fallback = code.indexOf("auth.decision.${phase}");
    expect(googleFirst).toBeGreaterThan(-1);
    expect(googleFirst).toBeLessThan(fallback);
  });

  it("still refuses admin to a Google account the server has not verified", () => {
    // The callback asks the server; it never grants from the chosen card.
    const code = withoutComments(authContext);
    const oauth = code.slice(code.indexOf("const resolveAfterOAuth ="), code.indexOf("const signOut ="));
    expect(oauth).toMatch(/claimAdminMutation\.mutateAsync\(\)/);
    expect(oauth).not.toMatch(/"\/admin"/);
  });
});

describe("an OAuth return says which thing is wrong", () => {
  it("treats a cancelled consent screen as ordinary, not an error", () => {
    for (const query of ["error=access_denied", "error=access_denied&error_description=The+user+denied+the+request", "error_description=user_cancelled"]) {
      expect(classifyOAuthReturn(new URLSearchParams(query))).toBe("cancelled");
    }
  });

  it("names an allow-list problem separately from a credential problem", () => {
    // Supabase's wording when the return address is not allow-listed, and
    // Google's wording when the URI is missing from the credential.
    expect(classifyOAuthReturn(new URLSearchParams("error=invalid_request&error_description=requested+path+is+invalid"))).toBe("redirect");
    expect(classifyOAuthReturn(new URLSearchParams("error=redirect_uri_mismatch"))).toBe("redirect");
  });

  it("names a misconfigured provider", () => {
    expect(classifyOAuthReturn(new URLSearchParams("error=invalid_client"))).toBe("misconfigured");
    expect(classifyOAuthReturn(new URLSearchParams("error=unauthorized_client"))).toBe("misconfigured");
    expect(classifyOAuthReturn(new URLSearchParams("error=validation_failed&error_description=Unsupported+provider%3A+provider+is+not+enabled"))).toBe("misconfigured");
  });

  it("reports anything else as unknown rather than guessing", () => {
    expect(classifyOAuthReturn(new URLSearchParams("error=something_new"))).toBe("failed");
  });

  it("says nothing at all when the return carries no error", () => {
    expect(classifyOAuthReturn(new URLSearchParams(""))).toBeNull();
    expect(classifyOAuthReturn(new URLSearchParams("code=abc123"))).toBeNull();
  });

  it("has wording for each category, in all three languages", () => {
    for (const key of ["auth.decision.oauth_redirect", "auth.decision.oauth_misconfigured", "auth.decision.oauth_failed", "auth.decision.oauth_disabled"]) {
      expect(catalog.split(`"${key}":`).length - 1, key).toBe(3);
    }
  });

  it("keeps the setup-needed message for a genuinely absent provider only", () => {
    // It is reached from the preflight, which reads the project's own settings —
    // never from a hand-set flag, and never from a failure that has another cause.
    const context = withoutComments(authContext);
    expect(context).toMatch(/if \(!\(await isGoogleEnabled\(\)\)\) return \{ ok: false, decision: "oauth_disabled" \}/);
    const lib = withoutComments(oauthLib);
    expect(lib).toMatch(/settings\.external\?\.google === true/);
    expect(lib).not.toMatch(/GOOGLE_ENABLED|ENABLE_GOOGLE|featureFlag/i);
  });

  it("returns to an address derived from the running origin, never a fixed port", () => {
    const lib = withoutComments(oauthLib);
    expect(lib).toMatch(/return `\$\{window\.location\.origin\}\/auth\/callback`;/);
    expect(lib).not.toMatch(/localhost:\d+|127\.0\.0\.1:\d+|:3000|:5173/);
    expect(withoutComments(authContext)).not.toMatch(/localhost:\d+/);
  });
});

describe("the board account holds no public role", () => {
  it("deletes only learner rows, and only on accounts that hold admin", () => {
    const statements = migration.replace(/^\s*--.*$/gm, "");
    expect(statements).toMatch(/delete from public\.user_roles ur/);
    expect(statements).toMatch(/where ur\.role = 'learner'/);
    expect(statements).toMatch(/and admin_row\.role in \('admin', 'super_admin'\)/);
  });

  it("can never remove an instructor role, or an admin role", () => {
    const statements = migration.replace(/^\s*--.*$/gm, "");
    // The row being deleted is pinned to one role by an equality on `ur.role`,
    // so nothing else can be swept up. `admin`/`super_admin` appear only in the
    // EXISTS that selects which accounts qualify, never as a deletion target.
    const predicate = statements.slice(statements.indexOf("where ur.role"), statements.indexOf("exists"));
    expect(predicate).toMatch(/ur\.role = 'learner'/);
    expect(predicate).not.toMatch(/instructor|admin/);
    expect(statements).not.toMatch(/ur\.role in/);
  });

  it("names no address, and its statements touch no other table", () => {
    // Prose may explain the audit; the STATEMENTS are what runs.
    const statements = migration.replace(/^\s*--.*$/gm, "");
    expect(statements).not.toMatch(/@|ADMIN_EMAIL|auth\.users/);
    expect(statements).not.toMatch(/learner_profiles|instructor_profiles/);
    expect(statements).not.toMatch(/from public\.profiles|update public\.profiles/);
    // And no address is written into the file at all, comments included.
    expect(migration).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  it("shows no public role on a privileged account", () => {
    const code = withoutComments(usersPage);
    expect(code).toMatch(/const PUBLIC_ROLE_NAMES = \["learner", "instructor"\];/);
    expect(code).toMatch(/privileged\s*\?\s*roles\.filter\(\(role\) => role !== named && !PUBLIC_ROLE_NAMES\.includes\(role\)\)/);
  });

  it("still shows a missing role as missing, never as Learner", () => {
    const code = withoutComments(usersPage);
    expect(code).toMatch(/unassigned: "adminUsers\.roleNotAssigned"/);
    expect(code).not.toMatch(/\?\?\s*"learner"|\|\|\s*"learner"/);
  });
});
