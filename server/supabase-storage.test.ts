import { describe, expect, it } from "vitest";
import { buildPrivateObjectPath, PRIVATE_BUCKETS, validatePrivateFile } from "./supabase-storage";

describe("private Supabase Storage contracts", () => {
  it("accepts allowed files and rejects MIME, size, and empty-file violations", () => {
    expect(validatePrivateFile(PRIVATE_BUCKETS.credentials, { filename: "certificate.pdf", mimeType: "application/pdf", sizeBytes: 1024 }).ok).toBe(true);
    expect(validatePrivateFile(PRIVATE_BUCKETS.credentials, { filename: "script.exe", mimeType: "application/octet-stream", sizeBytes: 1024 }).error).toBe("Invalid file.");
    expect(validatePrivateFile(PRIVATE_BUCKETS.credentials, { filename: "empty.pdf", mimeType: "application/pdf", sizeBytes: 0 }).error).toBe("Invalid file.");
    expect(validatePrivateFile(PRIVATE_BUCKETS.credentials, { filename: "large.pdf", mimeType: "application/pdf", sizeBytes: 11 * 1024 * 1024 }).error).toBe("Invalid file.");
  });

  it("uses user/course/session-scoped paths and removes path separators", () => {
    expect(buildPrivateObjectPath(PRIVATE_BUCKETS.credentials, "user-a", { filename: "../../credential.pdf" })).toBe("user-a/credentials/..-..-credential.pdf");
    expect(buildPrivateObjectPath(PRIVATE_BUCKETS.courseMedia, "instructor-a", { courseId: "course-a", filename: "lesson.pdf" })).toBe("instructor-a/courses/course-a/lesson.pdf");
    expect(buildPrivateObjectPath(PRIVATE_BUCKETS.classroomResources, "learner-a", { sessionId: "session-a", filename: "worksheet.pdf" })).toBe("session-a/learner-a/worksheet.pdf");
  });
});
