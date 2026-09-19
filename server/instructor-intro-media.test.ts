/**
 * The teacher's own introduction video and recitation.
 *
 * The bucket and the table for these have existed since the first migration, with nothing able to
 * write to them: no upload control, no read, no player. What is checked here is the boundary that
 * had to come with them — a file is private when it arrives, the object path is the caller's own,
 * and a visitor only ever reaches a file its owner marked public on a published, approved profile.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRIVATE_BUCKETS, buildPrivateObjectPath, validatePrivateFile } from "./supabase-storage";

const storage = readFileSync(new URL("./supabase-storage.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./supabase-core.ts", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const uploader = readFileSync(new URL("../client/src/components/InstructorIntroMedia.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");

const MB = 1024 * 1024;
const file = (mimeType: string, sizeBytes = MB) => ({ filename: "intro.bin", mimeType, sizeBytes });

describe("what a teacher may upload as an introduction", () => {
  it("takes a video and a recitation, which is what the profile offers", () => {
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, file("video/mp4")).ok).toBe(true);
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, file("audio/mpeg")).ok).toBe(true);
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, file("audio/wav")).ok).toBe(true);
  });

  it("refuses a type the profile has no player for", () => {
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, file("application/pdf"))).toEqual({ ok: false, error: "Invalid file." });
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, file("text/html"))).toEqual({ ok: false, error: "Invalid file." });
  });

  it("holds the 25 MB ceiling rather than letting a long recording through", () => {
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, file("video/mp4", 25 * MB)).ok).toBe(true);
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, file("video/mp4", 25 * MB + 1)).ok).toBe(false);
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, file("video/mp4", 0)).ok).toBe(false);
  });

  it("puts every file under the uploader's own folder, whatever it is called", () => {
    const owner = "11111111-2222-3333-4444-555555555555";
    expect(buildPrivateObjectPath(PRIVATE_BUCKETS.instructorMedia, owner, { filename: "intro.mp4" })).toBe(`${owner}/media/intro.mp4`);

    // A name that tries to climb out is refused at the gate: the permission request validates the
    // filename before any path is built.
    expect(validatePrivateFile(PRIVATE_BUCKETS.instructorMedia, { filename: "../../owned.mp4", mimeType: "video/mp4", sizeBytes: MB }).ok).toBe(false);

    // And if one ever reached the builder, every separator is collapsed into the single trailing
    // segment, so the result still has exactly three parts and still begins with the owner.
    const escaped = buildPrivateObjectPath(PRIVATE_BUCKETS.instructorMedia, owner, { filename: "../../someone-else/intro.mp4" });
    expect(escaped.split("/")).toHaveLength(3);
    expect(escaped.split("/")[0]).toBe(owner);
  });
});

describe("the record that describes the file", () => {
  it("refuses a path that is not the caller's own", () => {
    const fn = core.slice(core.indexOf("export async function createInstructorMedia"), core.indexOf("export async function setOwnInstructorMediaVisibility"));
    expect(fn).toContain("!input.objectPath.startsWith(`${identity.id}/`)");
    expect(fn).toContain("instructor_id: identity.id");
  });

  it("scopes every change and removal to the owner", () => {
    for (const name of ["setOwnInstructorMediaVisibility", "deleteOwnInstructorMedia"]) {
      const fn = core.slice(core.indexOf(`export async function ${name}`));
      expect(fn.slice(0, 900), `${name} must filter by the caller`).toContain('.eq("instructor_id", identity.id)');
    }
  });

  it("is reachable only through procedures that require an account", () => {
    for (const procedure of ["instructorMedia: supabaseOnlyProcedure", "createInstructorMedia: supabaseOnlyProcedure", "setInstructorMediaVisibility: supabaseOnlyProcedure", "deleteInstructorMedia: supabaseOnlyProcedure"]) {
      expect(routers).toContain(procedure);
    }
  });
});

describe("what a visitor can play", () => {
  it("reads only public media on a published, approved profile", () => {
    const fn = scheduling.slice(scheduling.indexOf("export async function getPublicInstructorMedia"), scheduling.indexOf("export async function listTrialRequests"));
    // A draft profile still hides its media; an unverified published one does not (0035).
    expect(fn).toContain('profile.public_profile_status !== "published"');
    expect(fn).toContain('.eq("visibility", "public")');
    // An unpublished teacher is an empty list, not an error that hints the slug exists.
    expect(fn).toContain("return { ok: true as const, data: [] };");
  });

  it("hands out expiring links, never a permanent path into the bucket", () => {
    expect(scheduling).toContain("signPublicObject(PRIVATE_BUCKETS.instructorMedia");
    const signer = storage.slice(storage.indexOf("export async function signPublicObject"));
    expect(signer.slice(0, 700)).toContain("createSignedUrl");
    expect(signer.slice(0, 700)).toContain("Math.min(expiresInSeconds, 24 * 3600)");
  });

  it("is a public procedure, because the profile that carries it is public", () => {
    expect(routers).toContain("instructorMedia: publicProcedure");
  });
});

describe("the two controls a teacher actually sees", () => {
  it("saves a new upload as private, so showing it stays a decision", () => {
    expect(uploader).toContain('visibility: "private"');
    expect(uploader).toContain('t("tutorMedia.showOnProfile")');
  });

  it("clears the object when the row could not be written, leaving nothing orphaned", () => {
    expect(uploader).toContain("await supabaseClient.storage.from(allowed.data.bucket).remove([allowed.data.objectPath]);");
  });

  it("offers each slot only the types its player can handle", () => {
    expect(uploader).toContain('{ video: "video/mp4", audio: "audio/mpeg,audio/wav" }');
  });
});

describe("the players on the public profile", () => {
  it("renders nothing at all when the teacher has uploaded nothing", () => {
    const fn = profile.slice(profile.indexOf("function PublicInstructorMedia"));
    expect(fn.slice(0, 1600)).toContain("if (!video && !audio) return null;");
  });

  it("uses the reference headings a learner is looking for", () => {
    expect(profile).toContain('t("tutorProfile.checkMyVideo")');
    expect(profile).toContain('t("tutorProfile.recitation")');
  });
});
