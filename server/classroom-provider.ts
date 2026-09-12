/**
 * The Live Classroom provider boundary.
 *
 * No provider is selected, and none is contacted. What this module defines is the shape a real
 * adapter will have to satisfy, so that connecting one later is an addition rather than a rewrite:
 * the procedures, the UI states and the session record all talk to `ClassroomProvider`, never to a
 * vendor SDK.
 *
 * The important design decision is that "no provider" is not a provider.
 *
 * A null-object adapter that returned plausible-looking values would be indistinguishable from a
 * working integration until it reached a learner, so there is none. `resolveClassroomProvider()`
 * instead returns a discriminated result, and the three failure shapes stay distinct because they
 * mean different things to different people:
 *
 *   not_configured   — nobody has set CLASSROOM_PROVIDER. An operator fixes this.
 *   unknown_provider — a name is set, but no adapter is registered under it. A developer fixes this.
 *                      This is the "failed provider" state: configuration exists and does not work,
 *                      which must never be reported as "not set up yet".
 *   incomplete       — the adapter exists but its required secrets are missing. An operator fixes it.
 *   ready            — an adapter is registered and its configuration is complete.
 *
 * `ADAPTERS` is deliberately empty. A real integration adds one entry and implements the interface;
 * nothing above it changes.
 */

/** Every provider call answers in the project's envelope, so callers handle them uniformly. */
export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: "SETUP_NEEDED" | "PROVIDER_FAILED" | "FORBIDDEN" | "NOT_FOUND" };

/** What a room looks like once a provider has created one. */
export type ProviderRoom = {
  /** The provider's own id for the meeting. Stored on class_sessions.external_session_id. */
  externalSessionId: string;
};

/** A join credential, always short-lived and always issued per person. */
export type JoinGrant = {
  joinUrl: string;
  /** ISO instant after which the grant is no longer valid. */
  expiresAt: string;
};

/** The recording states the platform understands, independent of any vendor's vocabulary. */
export const RECORDING_STATUSES = ["not_configured", "not_recorded", "recording", "processing", "available", "failed"] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

/** A provider event, normalised. An adapter maps its vendor's payload onto this and nothing else. */
export type ProviderEvent = {
  /** Stable per event, so a redelivered webhook is recognisable. Used as the idempotency key. */
  externalEventId: string;
  type: "room_started" | "room_ended" | "participant_joined" | "participant_left" | "recording_ready" | "recording_failed";
  externalSessionId: string;
  occurredAt: string;
};

/**
 * What any Live Classroom adapter must provide.
 *
 * Every method is asynchronous and fallible, because every one of them is a network call to somebody
 * else's system. None of them may invent a value on failure.
 */
export interface ClassroomProvider {
  readonly name: string;
  /** Env names this adapter needs. Reported by status; values are never read outside the adapter. */
  readonly requiredEnv: readonly string[];

  /** Creates the meeting for a session. Must be idempotent on `sessionId`. */
  createRoom(input: { sessionId: string; scheduledStartAt: string; scheduledEndAt: string }): Promise<ProviderResult<ProviderRoom>>;

  /** Issues a short-lived, per-person join credential. Never a shared or permanent link. */
  issueJoinGrant(input: { externalSessionId: string; userId: string; role: "host" | "guest"; displayName: string }): Promise<ProviderResult<JoinGrant>>;

  /** Closes the meeting. Called when the instructor ends the session. */
  endRoom(input: { externalSessionId: string }): Promise<ProviderResult<void>>;

  /** Reports what the provider currently holds for this room. */
  readRecordingStatus(input: { externalSessionId: string }): Promise<ProviderResult<RecordingStatus>>;

  /**
   * Verifies a webhook's authenticity from its raw bytes and headers, and normalises it.
   *
   * Raw bytes, not a parsed object: a signature covers the exact payload, and re-serialising JSON
   * changes it. See `handleClassroomWebhook` for what that means for mounting.
   */
  verifyWebhook(input: { rawBody: Buffer | string; headers: Record<string, string | undefined> }): ProviderResult<ProviderEvent>;
}

/**
 * Registered adapters, by the name `CLASSROOM_PROVIDER` would carry.
 *
 * Empty on purpose. Adding a real provider means adding one entry here and implementing the
 * interface above — no procedure, route, component or database column changes.
 */
const ADAPTERS: Record<string, () => ClassroomProvider> = {};

export type ProviderResolution =
  | { status: "not_configured"; missing: string[] }
  | { status: "unknown_provider"; name: string; known: string[] }
  | { status: "incomplete"; name: string; missing: string[] }
  | { status: "ready"; provider: ClassroomProvider };

/** Resolves the configured provider, or says precisely why it could not. */
export function resolveClassroomProvider(env: NodeJS.ProcessEnv = process.env): ProviderResolution {
  const name = env.CLASSROOM_PROVIDER?.trim();
  if (!name) return { status: "not_configured", missing: ["CLASSROOM_PROVIDER"] };

  const factory = ADAPTERS[name];
  // A name with no adapter behind it is a broken configuration, not an absent one.
  if (!factory) return { status: "unknown_provider", name, known: Object.keys(ADAPTERS) };

  const provider = factory();
  const missing = provider.requiredEnv.filter((key) => !env[key]?.trim());
  if (missing.length) return { status: "incomplete", name, missing };
  return { status: "ready", provider };
}

/** The status shape the UI renders. Carries env *names* only — never a value. */
export type ClassroomProviderStatus = {
  configured: boolean;
  /** Distinguishes "nobody set it up" from "it is set up and broken". */
  reason: "not_configured" | "unknown_provider" | "incomplete" | "ready";
  provider: string | null;
  missing: string[];
};

export function classroomProviderStatus(env: NodeJS.ProcessEnv = process.env): ClassroomProviderStatus {
  const resolved = resolveClassroomProvider(env);
  switch (resolved.status) {
    case "ready":
      return { configured: true, reason: "ready", provider: resolved.provider.name, missing: [] };
    case "unknown_provider":
      return { configured: false, reason: "unknown_provider", provider: resolved.name, missing: [] };
    case "incomplete":
      return { configured: false, reason: "incomplete", provider: resolved.name, missing: resolved.missing };
    default:
      return { configured: false, reason: "not_configured", provider: null, missing: resolved.missing };
  }
}

/* -------------------------------------------------------------- webhooks */

/**
 * The webhook boundary.
 *
 * Transport-agnostic and unmounted, deliberately. Three things have to be true before a webhook
 * endpoint exists, and none of them is true yet:
 *
 *   1. A provider is selected, so there is something to verify a signature against.
 *   2. The route receives the RAW request body. `express.json()` is applied globally in the core
 *      server, and a parsed-then-re-serialised body no longer matches its signature, so the mount
 *      must use `express.raw()` ahead of that parser.
 *   3. Events are stored for idempotency. Providers redeliver, and a redelivered "room_ended" must
 *      not close a session twice. That store is the Notifications/Webhooks module's job.
 *
 * Until then this function exists so the shape is fixed and testable: it refuses everything, and
 * refuses in a way that names which of the three is missing rather than failing silently.
 */
export function handleClassroomWebhook(input: {
  rawBody: Buffer | string;
  headers: Record<string, string | undefined>;
  env?: NodeJS.ProcessEnv;
}): ProviderResult<ProviderEvent> {
  const resolved = resolveClassroomProvider(input.env ?? process.env);
  if (resolved.status !== "ready") {
    // No provider means no signing key, and an unverified event is not an event.
    return { ok: false, error: "No classroom provider is configured, so provider events cannot be verified.", code: "SETUP_NEEDED" };
  }
  const verified = resolved.provider.verifyWebhook({ rawBody: input.rawBody, headers: input.headers });
  if (!verified.ok) return verified;

  // Deliberately stops here. Acting on a verified event requires the idempotency store, and applying
  // one without it would let a redelivery repeat a side effect.
  return { ok: false, error: "Provider event verified, but event persistence is not connected yet.", code: "SETUP_NEEDED" };
}
