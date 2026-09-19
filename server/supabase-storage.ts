import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import type { SupabaseIdentity } from "./supabase-auth";

export const PRIVATE_BUCKETS = {
  credentials: "instructor-credentials",
  instructorMedia: "instructor-media",
  courseMedia: "course-media",
  classroomResources: "classroom-resources",
} as const;

const LIMITS = { [PRIVATE_BUCKETS.credentials]: 10 * 1024 * 1024, [PRIVATE_BUCKETS.instructorMedia]: 25 * 1024 * 1024, [PRIVATE_BUCKETS.courseMedia]: 50 * 1024 * 1024, [PRIVATE_BUCKETS.classroomResources]: 25 * 1024 * 1024 } as const;
const MIME = {
  [PRIVATE_BUCKETS.credentials]: new Set(["application/pdf", "image/jpeg", "image/png"]),
  // Audio belongs here too: a teacher introduces themselves with a short recitation as often as
  // with a video, and the profile offers both.
  [PRIVATE_BUCKETS.instructorMedia]: new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "audio/mpeg", "audio/wav"]),
  [PRIVATE_BUCKETS.courseMedia]: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/mpeg", "audio/wav"]),
  [PRIVATE_BUCKETS.classroomResources]: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/mpeg", "audio/wav", "video/mp4"]),
} as const;

export type PrivateBucket = typeof PRIVATE_BUCKETS[keyof typeof PRIVATE_BUCKETS];
export type StorageError = "Invalid file." | "Forbidden." | "Storage unavailable." | "Storage operation failed.";
export type StorageResult<T> = { ok: true; data: T } | { ok: false; error: StorageError };

function storageClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function cleanSegment(value: string) {
  const clean = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  return clean && clean !== "." && clean !== ".." ? clean.slice(0, 160) : "file";
}

export function validatePrivateFile(bucket: PrivateBucket, input: { filename: string; mimeType: string; sizeBytes: number }): StorageResult<{ filename: string; mimeType: string; sizeBytes: number }> {
  if (!MIME[bucket].has(input.mimeType) || !Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > LIMITS[bucket]) return { ok: false, error: "Invalid file." };
  const filename = cleanSegment(input.filename);
  if (!filename || filename.includes("..") || filename.includes("/")) return { ok: false, error: "Invalid file." };
  return { ok: true, data: { filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes } };
}

export function buildPrivateObjectPath(bucket: PrivateBucket, identityId: string, input: { filename: string; courseId?: string; sessionId?: string }) {
  const filename = cleanSegment(input.filename);
  if (bucket === PRIVATE_BUCKETS.credentials) return `${identityId}/credentials/${filename}`;
  if (bucket === PRIVATE_BUCKETS.instructorMedia) return `${identityId}/media/${filename}`;
  if (bucket === PRIVATE_BUCKETS.courseMedia) return `${identityId}/courses/${cleanSegment(input.courseId ?? "course")}/${filename}`;
  return `${cleanSegment(input.sessionId ?? "session")}/${identityId}/${filename}`;
}

async function query<T extends pg.QueryResultRow = any>(sql: string, values: unknown[]) {
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 10000, query_timeout: 30000, ssl: { rejectUnauthorized: false } });
  try { await client.connect(); return await client.query<T>(sql, values); } finally { await client.end().catch(() => undefined); }
}

async function canAccess(identity: SupabaseIdentity, bucket: PrivateBucket, path: string, mode: "read" | "write" | "delete") {
  const roles = await query<{ role: string }>("select role::text from public.user_roles where user_id=$1::uuid", [identity.id]);
  const roleSet = new Set(roles.rows.map((row) => row.role));
  const isAdmin = roleSet.has("admin") || roleSet.has("super_admin");
  if (isAdmin) return true;
  if (bucket === PRIVATE_BUCKETS.credentials || bucket === PRIVATE_BUCKETS.instructorMedia) return path.startsWith(`${identity.id}/`) && roleSet.has("instructor");
  if (bucket === PRIVATE_BUCKETS.courseMedia) {
    const courseId = path.split("/")[2];
    const result = await query<{ ok: boolean }>("select exists (select 1 from public.courses c where c.id=$1::uuid and (c.instructor_id=$2::uuid or ($3='read' and exists (select 1 from public.enrolments e where e.course_id=c.id and e.learner_id=$2::uuid and e.status in ('active','completed'))))) as ok", [courseId, identity.id, mode]);
    return result.rows[0]?.ok === true;
  }
  const sessionId = path.split("/")[0];
  const result = await query<{ ok: boolean }>("select exists (select 1 from public.class_participants p where p.session_id=$1::uuid and p.user_id=$2::uuid) as ok", [sessionId, identity.id]);
  return result.rows[0]?.ok === true && mode !== "delete";
}

export async function requestUploadPermission(identity: SupabaseIdentity, input: { bucket: PrivateBucket; filename: string; mimeType: string; sizeBytes: number; courseId?: string; sessionId?: string }): Promise<StorageResult<{ bucket: PrivateBucket; objectPath: string; maxSizeBytes: number }>> {
  const valid = validatePrivateFile(input.bucket, input); if (!valid.ok) return valid;
  if (input.bucket === PRIVATE_BUCKETS.courseMedia && !input.courseId) return { ok: false, error: "Invalid file." };
  if (input.bucket === PRIVATE_BUCKETS.classroomResources && !input.sessionId) return { ok: false, error: "Invalid file." };
  const objectPath = buildPrivateObjectPath(input.bucket, identity.id, input);
  if (!(await canAccess(identity, input.bucket, objectPath, "write"))) return { ok: false, error: "Forbidden." };
  return { ok: true, data: { bucket: input.bucket, objectPath, maxSizeBytes: LIMITS[input.bucket] } };
}

export async function uploadPrivateObject(identity: SupabaseIdentity, input: { bucket: PrivateBucket; objectPath: string; data: Uint8Array; mimeType: string }): Promise<StorageResult<{ bucket: PrivateBucket; objectPath: string }>> {
  if (!MIME[input.bucket].has(input.mimeType) || input.data.byteLength <= 0 || input.data.byteLength > LIMITS[input.bucket]) return { ok: false, error: "Invalid file." };
  if (!(await canAccess(identity, input.bucket, input.objectPath, "write"))) return { ok: false, error: "Forbidden." };
  const storage = storageClient(); if (!storage) return { ok: false, error: "Storage unavailable." };
  const { error } = await storage.storage.from(input.bucket).upload(input.objectPath, input.data, { contentType: input.mimeType, upsert: false });
  return error ? { ok: false, error: "Storage operation failed." } : { ok: true, data: { bucket: input.bucket, objectPath: input.objectPath } };
}

export async function createSignedDownloadUrl(identity: SupabaseIdentity, input: { bucket: PrivateBucket; objectPath: string; expiresInSeconds?: number }): Promise<StorageResult<{ signedUrl: string; expiresInSeconds: number }>> {
  if (!(await canAccess(identity, input.bucket, input.objectPath, "read"))) return { ok: false, error: "Forbidden." };
  const storage = storageClient(); if (!storage) return { ok: false, error: "Storage unavailable." };
  const expiresInSeconds = Math.max(60, Math.min(input.expiresInSeconds ?? 300, 900));
  const { data, error } = await storage.storage.from(input.bucket).createSignedUrl(input.objectPath, expiresInSeconds);
  return error || !data?.signedUrl ? { ok: false, error: "Storage operation failed." } : { ok: true, data: { signedUrl: data.signedUrl, expiresInSeconds } };
}

/**
 * A signed URL for an object whose audience has ALREADY been decided by the caller.
 *
 * `createSignedDownloadUrl` is the one to reach for: it checks who is asking. This one does not,
 * and exists for the single case where the asker may be nobody at all — a visitor reading a public
 * profile. The gate then lives with the record: only media the instructor marked public, on a
 * profile that is published and approved, reaches this function. Do not call it anywhere that has
 * not made that check first.
 */
export async function signPublicObject(bucket: PrivateBucket, objectPath: string, expiresInSeconds = 3600): Promise<StorageResult<{ signedUrl: string; expiresInSeconds: number }>> {
  const storage = storageClient(); if (!storage) return { ok: false, error: "Storage unavailable." };
  const expires = Math.max(60, Math.min(expiresInSeconds, 24 * 3600));
  const { data, error } = await storage.storage.from(bucket).createSignedUrl(objectPath, expires);
  return error || !data?.signedUrl ? { ok: false, error: "Storage operation failed." } : { ok: true, data: { signedUrl: data.signedUrl, expiresInSeconds: expires } };
}

export async function deletePrivateObject(identity: SupabaseIdentity, input: { bucket: PrivateBucket; objectPath: string }): Promise<StorageResult<{ deleted: true }>> {
  if (!(await canAccess(identity, input.bucket, input.objectPath, "delete"))) return { ok: false, error: "Forbidden." };
  const storage = storageClient(); if (!storage) return { ok: false, error: "Storage unavailable." };
  const { error } = await storage.storage.from(input.bucket).remove([input.objectPath]);
  return error ? { ok: false, error: "Storage operation failed." } : { ok: true, data: { deleted: true } };
}
