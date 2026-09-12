import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const scheduling = readFileSync(new URL("./scheduling.ts", import.meta.url), "utf8");
const schedulingUi = readFileSync(new URL("../client/src/components/SchedulingExperience.tsx", import.meta.url), "utf8");
const instructors = readFileSync(new URL("../client/src/components/InstructorManagement.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const rls = readFileSync(new URL("../supabase/migrations/0002_auth_and_rls.sql", import.meta.url), "utf8");
const verificationGuard = readFileSync(new URL("../supabase/migrations/0015_verification_is_admin_only.sql", import.meta.url), "utf8");

/**
 * The journey is discovery → profile → trial request. Every step is public up to the request, so the
 * gate that decides who appears at all is the thing that matters most.
 */
describe("only a published AND approved instructor is discoverable", () => {
  it("applies both conditions before any caller-supplied filter", () => {
    const discovery = scheduling.slice(scheduling.indexOf("export async function listPublicInstructors"), scheduling.indexOf("export async function listInstructorFilterFacets"));
    expect(discovery).toContain('.eq("public_profile_status", "published")');
    expect(discovery).toContain('.eq("verification_status", "approved")');
    // A filter must never be able to widen the set, only narrow it.
    expect(discovery.indexOf('.eq("verification_status", "approved")')).toBeLessThan(discovery.indexOf("filters.gender"));
  });

  it("applies the same gate to a profile fetched by slug", () => {
    const bySlug = scheduling.slice(scheduling.indexOf("export async function getPublicInstructorBySlug"));
    expect(bySlug).toContain('.eq("public_profile_status", "published")');
    expect(bySlug).toContain('.eq("verification_status", "approved")');
  });

  it("rests on a policy that says the same thing, so a direct read cannot bypass it", () => {
    expect(rls).toContain("create policy instructor_profiles_public_or_own on public.instructor_profiles for select using ((public_profile_status = 'published' and verification_status = 'approved') or auth.uid() = user_id");
  });

  it("keeps approval out of the instructor's own hands", () => {
    // This is the blocker Task 12 reports, and 0015 is what enforces it.
    expect(verificationGuard).toContain("if new.verification_status is distinct from old.verification_status then");
    expect(verificationGuard).toContain("if not (public.is_admin_user() or public.is_moderator_user()) then");
    expect(verificationGuard).toContain("create trigger instructor_profiles_verification_guard");
  });
});

describe("every step of the journey is wired and reachable", () => {
  it("discovery reads the real procedures", () => {
    expect(app).toContain("trpc.schedulingPublic.instructors.useQuery");
    expect(app).toContain("trpc.schedulingPublic.instructorFacets.useQuery");
  });

  it("a discovery card leads to that instructor's profile", () => {
    expect(app).toContain('href={(embedded ? "/dashboard/learner/teachers/" : "/teachers/") + instructor.public_slug}');
  });

  it("tells a failed search apart from an empty marketplace", () => {
    // isError alone never sees a handled ok:false, which is how a broken search looked empty.
    expect(app).toContain("const discoveryFailed = instructorsQuery.isError || (instructorsQuery.data !== undefined && !instructorsQuery.data.ok);");
  });

  it("the profile offers the three actions that depend on it", () => {
    expect(instructors).toContain("<TrialCTA context={{ instructorSlug: slug }}");
    expect(instructors).toContain("<MessageAction counterpartId={profile.user_id} tone=\"standard\"/>");
    expect(instructors).toContain("<InstructorRating instructorId={profile.user_id}/>");
  });

  it("the trial flow loads the instructor it was sent, and books against them", () => {
    expect(schedulingUi).toContain("trpc.schedulingPublic.instructorBySlug.useQuery");
    expect(schedulingUi).toContain("trpc.scheduling.availableSlots.useQuery");
    expect(schedulingUi).toContain("instructorId: instructor.user_id");
    expect(routers).toContain("createTrial: supabaseOnlyProcedure");
  });

  it("only submits a slot the server confirmed", () => {
    expect(schedulingUi).toContain("const slotAvailable = availableSlotsQuery.data?.ok && availableSlotsQuery.data.data.some((slot) => slot.startAt === requestedStart && slot.endAt === requestedEnd);");
    expect(schedulingUi).toContain('setError("Choose an available server-confirmed slot before submitting.");');
  });
});

describe("the trial form names the instructor it is actually booking", () => {
  it("no longer carries a fictional default instructor", () => {
    // A bare /trial/request used to load "maryam-khan", and the form showed "Ustadha Maryam Khan"
    // whoever the learner had actually chosen — on the first step and again on the review step.
    expect(schedulingUi).not.toContain('instructorSlug = "maryam-khan"');
    expect(schedulingUi).not.toContain('instructorName: "Ustadha Maryam Khan"');
    expect(schedulingUi).toContain('export function TrialRequestFlow({ instructorSlug = "", courseTitle = "" }');
  });

  it("takes the name from the loaded profile, falling back to the slug", () => {
    expect(schedulingUi).toContain("const instructorDisplayName = instructorQuery.data?.ok ?");
    expect(schedulingUi).toContain('<Field label="Instructor"><input value={instructorDisplayName} readOnly className="input" placeholder="No instructor selected"/></Field>');
    expect(schedulingUi).toContain('<p><strong>Instructor:</strong> {instructorDisplayName || "—"}</p>');
  });

  it("returns only the public display name with the profile, nothing more", () => {
    // Bounded at the next export, so a later function's columns cannot satisfy this.
    const bySlug = scheduling.slice(
      scheduling.indexOf("export async function getPublicInstructorBySlug"),
      scheduling.indexOf("export async function listTrialRequests"),
    );
    // The profile page shows what the discovery card shows, so both read the person
    // through one helper instead of each selecting its own columns. That helper is
    // gated on the person's own profile_visibility, which makes this stricter than
    // the direct read it replaced: that one named an instructor who had kept their
    // profile private, this one falls back to the public slug.
    expect(bySlug).toContain("attachPublicPresentation([data])");
    expect(bySlug).not.toMatch(/email|phone|full_name/);
    // It is read only after the published+approved gate has already matched.
    expect(bySlug.indexOf('.eq("verification_status", "approved")')).toBeLessThan(bySlug.indexOf("attachPublicPresentation"));

    // The allow-list itself, where the helper lives.
    const helper = scheduling.slice(
      scheduling.indexOf("async function attachPublicPresentation"),
      scheduling.indexOf("export async function listInstructorFilterFacets"),
    );
    expect(helper).toContain('String(row.profile_visibility ?? "") === "public"');
    expect(helper).not.toMatch(/email|phone|\bcity\b/);
  });
});
