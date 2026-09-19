/**
 * The visible brand is Zufishan, and the identifiers underneath it are not.
 *
 * A rename is the kind of change that is easy to do too thoroughly. Storage keys, a database
 * trigger and the package name all carry the old brand, and every one of them would break something
 * real if it were "tidied up": a renamed localStorage key signs people out of their own saved theme
 * and locale, and a renamed trigger is a migration against auth. So this file pins both halves —
 * that nothing user-facing still says the old name, and that the identifiers still do.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const html = read("client/index.html");
const app = read("client/src/App.tsx");
const catalog = read("client/src/i18n/catalog.ts");
const sidebar = read("client/src/components/DashboardSidebar.tsx");

describe("what a visitor sees", () => {
  it("names Zufishan in the document head, including the social cards", () => {
    expect(html).toContain("<title>Zufishan · Learning studio</title>");
    expect(html).toContain('content="Zufishan · Learning studio"');
    expect(html).toContain('property="og:site_name" content="Zufishan"');
    expect(html).not.toContain("Noor Ilm");
  });

  it("finally declares an icon, which the old head never did", () => {
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/brand/zufishan-icon.svg" />');
    expect(html).toContain('rel="apple-touch-icon"');
  });

  it("carries the brand in all three languages", () => {
    expect(catalog.match(/"brand\.name": "Zufishan"/g)).toHaveLength(3);
    // The name stays in Latin script inside Urdu and Arabic copy: an invented Arabic-script
    // spelling would put a name on the page that nobody agreed to.
    expect(catalog).not.toContain("\u0646\u0648\u0631 \u0639\u0644\u0645");
    expect(catalog).not.toContain("\u0646\u0648\u0631\u0650 \u0639\u0644\u0645");
  });

  it("points the logo and the blog cover picker at the new mark", () => {
    expect(app).toContain('const mark = "/brand/zufishan-mark.svg";');
    expect(read("client/src/components/AdminBlogExperience.tsx")).toContain('"/brand/zufishan-mark.svg"');
  });

  it("draws the rail mark from theme tokens, so it reads in both themes", () => {
    expect(sidebar).toContain('stroke="var(--ni-gold)"');
    expect(sidebar).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("does not say the brand twice in one browser tab", () => {
    // The home route's own name IS the brand, so the suffix used to print it again.
    expect(app).toContain('publicTitle === t("brand.name") ? `${publicTitle} · ${t("brand.tagline")}`');
  });

  it("leaves no old-brand text anywhere the application ships", () => {
    const roots = ["client/src", "server", "shared"];
    const walk = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true })
      .flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
    const offenders = roots
      .flatMap(walk)
      .filter((rel) => /\.(ts|tsx|css|html)$/.test(rel))
      // This file names the old brand deliberately, in the assertions below.
      .filter((rel) => !rel.endsWith("brand-identity.test.ts"))
      .filter((rel) => read(rel).includes("Noor Ilm"));
    expect(offenders).toEqual([]);
  });
});

describe("what must keep the old name", () => {
  it("keeps every stored key, or people lose their theme, locale and half-finished sign-up", () => {
    const keys: Array<[string, string]> = [
      ["client/src/lib/theme.ts", '"noor-ilm-theme"'],
      ["client/src/contexts/LocaleContext.tsx", '"noor-ilm-locale"'],
      ["client/src/lib/auth-models.ts", '"noor-ilm-onboarding-draft"'],
      ["client/src/lib/auth-oauth.ts", '"noor-ilm-oauth-intent"'],
      ["client/src/components/DashboardSidebar.tsx", '"noor-ilm-sidebar-collapsed"'],
      ["client/src/components/AdminShell.tsx", '"noor-ilm-admin-sidebar"'],
    ];
    for (const [file, key] of keys) {
      expect(read(file), `${key} must survive the rename`).toContain(key);
    }
  });

  it("keeps the database trigger, because renaming it is a migration against auth", () => {
    expect(read("supabase/migrations/0002_auth_and_rls.sql")).toContain("on_auth_user_created_noor_ilm");
  });

  it("leaves applied migrations byte-identical, brand text included", () => {
    // These files record what already ran. Editing one — even a comment — makes the repository
    // disagree with the database, and one of them is a real `comment on schema` statement.
    expect(read("supabase/migrations/0001_noor_ilm_lms_canonical.sql")).toContain("Noor Ilm LMS canonical schema");
  });

  it("keeps the package name, which tooling and lockfiles refer to", () => {
    expect(read("package.json")).toContain('"name": "noor-ilm-lms"');
  });
});
