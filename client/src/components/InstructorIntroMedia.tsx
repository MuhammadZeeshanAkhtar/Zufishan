/**
 * The teacher's own introduction: a short video, and a recitation to listen to.
 *
 * Both are files the teacher uploads and can take down again. Nothing is generated, nothing is
 * borrowed, and a profile with no upload simply has no player on it.
 *
 * The upload is the same three steps the credential upload takes, in the same order, because the
 * order is what keeps storage and the table from disagreeing: ask the server where this file may go,
 * put the bytes there, then record the row. If the row fails the object is removed again, so a file
 * nobody can see is never left behind in the bucket.
 *
 * Visibility is the teacher's switch and it starts OFF. A file is private until they decide to show
 * it, and the public profile only ever reads rows marked public on a published, approved profile.
 */
import { useRef, useState } from "react";
import { Loader2, Mic, Trash2, Video } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "../lib/supabase-client";
import { useLocale } from "../contexts/LocaleContextState";

type MediaRow = { id: string; object_path: string; mime_type: string; size_bytes: number; visibility: string };
type Kind = "video" | "audio";

const ACCEPT: Record<Kind, string> = { video: "video/mp4", audio: "audio/mpeg,audio/wav" };

export default function InstructorIntroMedia() {
  const { t } = useLocale();
  const { currentSession } = useAuth();
  const connected = Boolean(currentSession && supabaseClient);

  const media = trpc.supabaseCore.instructorMedia.useQuery(undefined, { enabled: connected, retry: false });
  const permission = trpc.storage.requestUploadPermission.useMutation();
  const record = trpc.supabaseCore.createInstructorMedia.useMutation();
  const setVisibility = trpc.supabaseCore.setInstructorMediaVisibility.useMutation();
  const remove = trpc.supabaseCore.deleteInstructorMedia.useMutation();

  const [busy, setBusy] = useState<Kind | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const rows = (media.data?.ok ? media.data.data : []) as MediaRow[];
  const find = (kind: Kind) => rows.find((row) => String(row.mime_type).startsWith(`${kind}/`)) ?? null;

  const upload = async (kind: Kind, file: File) => {
    setNotice("");
    setFailure("");
    if (!connected || !supabaseClient) { setFailure(t("tutorMedia.uploadFailed")); return; }
    setBusy(kind);
    try {
      const allowed = await permission.mutateAsync({ bucket: "instructor-media", filename: file.name, mimeType: file.type, sizeBytes: file.size });
      if (!allowed.ok) { setFailure(allowed.error); return; }
      const stored = await supabaseClient.storage.from(allowed.data.bucket).upload(allowed.data.objectPath, file, { contentType: file.type, upsert: false });
      if (stored.error) { setFailure(t("tutorMedia.uploadFailed")); return; }
      // Private on arrival: showing it is a separate decision, made with the switch below.
      const saved = await record.mutateAsync({ objectPath: allowed.data.objectPath, mimeType: file.type, sizeBytes: file.size, visibility: "private" });
      if (!saved.ok) {
        await supabaseClient.storage.from(allowed.data.bucket).remove([allowed.data.objectPath]);
        setFailure(t("tutorMedia.uploadFailed"));
        return;
      }
      await media.refetch();
      setNotice(t("tutorMedia.uploaded"));
    } catch {
      setFailure(t("tutorMedia.uploadFailed"));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (row: MediaRow, next: boolean) => {
    setNotice("");
    setFailure("");
    const result = await setVisibility.mutateAsync({ mediaId: row.id, visibility: next ? "public" : "private" });
    if (!result.ok) { setFailure(t("tutorMedia.uploadFailed")); return; }
    await media.refetch();
    setNotice(next ? t("tutorMedia.nowPublic") : t("tutorMedia.nowPrivate"));
  };

  const drop = async (row: MediaRow) => {
    setNotice("");
    setFailure("");
    const result = await remove.mutateAsync({ mediaId: row.id });
    if (!result.ok) { setFailure(t("tutorMedia.uploadFailed")); return; }
    // The row is the record of the file; with it gone the object in the bucket has no reader.
    if (supabaseClient) await supabaseClient.storage.from("instructor-media").remove([row.object_path]);
    await media.refetch();
    setNotice(t("tutorMedia.removed"));
  };

  return (
    <section className="mt-8 rounded-[1.35rem] border border-[var(--ni-sage)] bg-[var(--ni-paper)] p-6">
      <h2 className="font-display text-xl ni-t-ink">{t("tutorMedia.title")}</h2>
      <p className="mt-1 text-xs ni-t-muted">{t("tutorMedia.limits")}</p>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Slot kind="video" row={find("video")} busy={busy === "video"} onUpload={upload} onToggle={toggle} onRemove={drop} />
        <Slot kind="audio" row={find("audio")} busy={busy === "audio"} onUpload={upload} onToggle={toggle} onRemove={drop} />
      </div>

      {notice && <p role="status" className="mt-4 rounded-xl border border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-4 py-2.5 text-sm ni-t-moss-deep">{notice}</p>}
      {failure && <p role="alert" className="mt-4 rounded-xl bg-[var(--ni-clay-soft)] px-4 py-2.5 text-sm ni-t-clay">{failure}</p>}
    </section>
  );
}

function Slot({ kind, row, busy, onUpload, onToggle, onRemove }: {
  kind: Kind;
  row: MediaRow | null;
  busy: boolean;
  onUpload: (kind: Kind, file: File) => void | Promise<void>;
  onToggle: (row: MediaRow, next: boolean) => void | Promise<void>;
  onRemove: (row: MediaRow) => void | Promise<void>;
}) {
  const { t } = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const Icon = kind === "video" ? Video : Mic;
  const label = kind === "video" ? t("tutorMedia.videoLabel") : t("tutorMedia.audioLabel");

  return (
    <div className="rounded-2xl border border-[var(--ni-sage-line)] bg-[var(--ni-field)] p-4">
      <p className="flex items-center gap-2 text-sm font-bold ni-t-ink">
        <Icon size={15} aria-hidden="true" className="ni-t-gold" />
        {label}
      </p>

      {row ? (
        <>
          <p className="mt-2 truncate text-xs ni-t-muted" title={row.object_path}>{row.object_path.split("/").pop()}</p>
          <label className="mt-3 flex items-center gap-2 text-xs font-semibold ni-t-moss-deep">
            <input
              type="checkbox"
              checked={row.visibility === "public"}
              onChange={(event) => void onToggle(row, event.target.checked)}
            />
            {t("tutorMedia.showOnProfile")}
          </label>
          <button
            type="button"
            onClick={() => void onRemove(row)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--ni-sage-mid)] px-3 py-1.5 text-xs font-bold ni-t-clay-ink hover:bg-[var(--ni-clay-soft)]"
          >
            <Trash2 size={13} aria-hidden="true" />
            {t("tutorMedia.remove")}
          </button>
        </>
      ) : (
        <>
          <input
            ref={input}
            type="file"
            accept={ACCEPT[kind]}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onUpload(kind, file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--ni-moss)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
            {busy ? t("tutorMedia.uploading") : kind === "video" ? t("tutorMedia.chooseVideo") : t("tutorMedia.chooseAudio")}
          </button>
        </>
      )}
    </div>
  );
}
