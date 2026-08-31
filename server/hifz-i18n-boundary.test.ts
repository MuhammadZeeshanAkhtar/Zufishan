import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(new URL("../client/src/components/HifzTrackerExperience.tsx", import.meta.url), "utf8");
const catalogueSource = readFileSync(new URL("../client/src/i18n/catalog.ts", import.meta.url), "utf8");

describe("Hifz localization boundary", () => {
  it("uses the shared dashboard back label in the Hifz frame", () => {
    expect(componentSource).toContain('t("dashboard.back")');
    expect(componentSource).not.toContain("> Back to learning desk</Link>");
  });

  it("maps learner record sections and statuses through catalogue keys", () => {
    for (const key of [
      't("hifz.sabaq")',
      't("hifz.sabqi")',
      't("hifz.manzil")',
      't("hifz.status.planned")',
      't("hifz.status.practiced")',
      't("hifz.status.needsRevision")',
      't("hifz.status.paused")',
      't("hifz.status.submitted")',
    ]) {
      expect(componentSource).toContain(key);
    }
  });

  it("keeps the Hifz keys present in the English, Urdu, and Arabic catalogue", () => {
    for (const key of [
      '"hifz.sabaq"',
      '"hifz.sabqi"',
      '"hifz.manzil"',
      '"hifz.status.planned"',
      '"hifz.status.practiced"',
      '"hifz.status.needsRevision"',
      '"hifz.status.paused"',
      '"hifz.status.submitted"',
    ]) {
      expect(catalogueSource.match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });
});

// This test is intentionally source-level: signed identity and cross-role RLS tests
// remain setup-needed until the owner creates isolated staging identities.
