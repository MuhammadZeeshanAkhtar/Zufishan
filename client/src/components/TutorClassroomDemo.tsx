/**
 * The teacher's practice classroom.
 *
 * The reference marketplace gives a tutor a demo room with a video stage and four teaching
 * surfaces — Quran, White Board, Noorani Qaida, Uploads — so they can rehearse before their first
 * class. This is that room, in this project's own design, with one difference that matters: each
 * surface says truthfully whether it works yet.
 *
 * The white board is real. It is a canvas, it draws, it erases, it undoes, it clears, and it saves
 * a PNG — none of which needs a provider, a key or a paid plan, so there was no reason to defer it.
 *
 * The other three are held open deliberately:
 *
 *  - **Video** needs the classroom provider, which `classroom-provider.ts` reports as not
 *    configured. A stage that looked live would be a lie about a call that cannot connect.
 *  - **Quran** and **Noorani Qaida** need an approved content source. This project has a standing
 *    rule that no Quran text, translation, Tafsir or Tajweed ruling is shown until that connection
 *    exists, and a practice room is not an exception to it.
 *  - **Uploads** needs the provider's in-lesson file channel.
 *
 * Each of those says who connects it — an administrator — rather than pretending to be broken.
 */
import { useEffect, useRef, useState } from "react";
import { Eraser, Maximize2, Minimize2, PenLine, RotateCcw, Trash2, Download, Video } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";

type Surface = "quran" | "board" | "qaida" | "uploads";

/** The pen palette. Fixed hexes: ink on a white board is the same in either theme. */
const INKS = ["#16120A", "#0E5F53", "#B8952E", "#A0492F", "#1F4E8C"];
const WIDTHS = [2, 4, 8, 14];

/* ------------------------------------------------------------- white board */

function WhiteBoard() {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  /** Finished strokes, kept so undo can repaint without a second canvas. */
  const strokes = useRef<{ points: [number, number][]; ink: string; width: number; erase: boolean }[]>([]);
  const current = useRef<{ points: [number, number][]; ink: string; width: number; erase: boolean } | null>(null);

  const [ink, setInk] = useState(INKS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [erasing, setErasing] = useState(false);

  /** Repaints every stored stroke. The canvas is a view of `strokes`, never the other way round. */
  const repaint = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      if (stroke.points.length === 0) continue;
      context.strokeStyle = stroke.erase ? "#FFFFFF" : stroke.ink;
      context.lineWidth = stroke.erase ? stroke.width * 3 : stroke.width;
      context.beginPath();
      context.moveTo(stroke.points[0][0], stroke.points[0][1]);
      for (const [x, y] of stroke.points.slice(1)) context.lineTo(x, y);
      // A single tap is a dot, not nothing.
      if (stroke.points.length === 1) context.lineTo(stroke.points[0][0] + 0.1, stroke.points[0][1]);
      context.stroke();
    }
  };

  // The canvas is sized to its box in device pixels, so strokes are not blurred or offset.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
      const context = canvas.getContext("2d");
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
      repaint();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };

  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    current.current = { points: [pointAt(event)], ink, width, erase: erasing };
    repaint();
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !current.current) return;
    current.current.points.push(pointAt(event));
    repaint();
  };
  const up = () => {
    if (current.current) strokes.current.push(current.current);
    current.current = null;
    drawing.current = false;
    repaint();
  };

  const undo = () => { strokes.current.pop(); repaint(); };
  const clear = () => { strokes.current = []; current.current = null; repaint(); };
  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "whiteboard.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const tool = (active: boolean) => `ni-btn ${active ? "ni-btn--primary" : "ni-btn--outline"} px-3 py-1.5 text-sm`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setErasing(false)} className={tool(!erasing)} aria-pressed={!erasing}>
          <PenLine size={14} aria-hidden="true" /> {t("tutorClassroom.pen")}
        </button>
        <button type="button" onClick={() => setErasing(true)} className={tool(erasing)} aria-pressed={erasing}>
          <Eraser size={14} aria-hidden="true" /> {t("tutorClassroom.eraser")}
        </button>

        <span className="mx-1 h-6 w-px bg-[var(--ni-sage-line)]" aria-hidden="true" />

        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">{t("tutorClassroom.colour")}</legend>
          {INKS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setInk(value); setErasing(false); }}
              aria-label={`${t("tutorClassroom.colour")} ${value}`}
              aria-pressed={!erasing && ink === value}
              style={{ background: value }}
              className={`h-7 w-7 rounded-full border-2 transition ${!erasing && ink === value ? "border-[var(--ni-gold)] scale-110" : "border-[var(--ni-sage-line)]"}`}
            />
          ))}
        </fieldset>

        <span className="mx-1 h-6 w-px bg-[var(--ni-sage-line)]" aria-hidden="true" />

        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">{t("tutorClassroom.thickness")}</legend>
          {WIDTHS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setWidth(value)}
              aria-label={`${t("tutorClassroom.thickness")} ${value}`}
              aria-pressed={width === value}
              className={`grid h-7 w-7 place-items-center rounded-full border transition ${width === value ? "border-[var(--ni-gold)] bg-[var(--ni-gold-soft)]" : "border-[var(--ni-sage-line)]"}`}
            >
              <span aria-hidden="true" className="block rounded-full bg-[var(--ni-ink)]" style={{ width: value + 2, height: value + 2 }} />
            </button>
          ))}
        </fieldset>

        <span className="ms-auto flex items-center gap-2">
          <button type="button" onClick={undo} className="ni-btn ni-btn--outline px-3 py-1.5 text-sm">
            <RotateCcw size={14} aria-hidden="true" className="rtl:-scale-x-100" /> {t("tutorClassroom.undo")}
          </button>
          <button type="button" onClick={save} className="ni-btn ni-btn--outline px-3 py-1.5 text-sm">
            <Download size={14} aria-hidden="true" /> {t("tutorClassroom.download")}
          </button>
          <button type="button" onClick={clear} className="ni-btn ni-btn--outline px-3 py-1.5 text-sm">
            <Trash2 size={14} aria-hidden="true" /> {t("tutorClassroom.clear")}
          </button>
        </span>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        aria-label={t("tutorClassroom.tabBoard")}
        className="mt-3 block h-[26rem] w-full touch-none rounded-2xl border border-[var(--ni-sage-line)] bg-white"
      />
      <p className="mt-2 text-xs leading-6 ni-t-muted">{t("tutorClassroom.boardHint")}</p>
    </div>
  );
}

/* --------------------------------------------------------- held-open panel */

function ComingSoon({ title, copy }: { title: string; copy: string }) {
  const { t } = useLocale();
  return (
    <div className="grid min-h-[26rem] place-items-center rounded-2xl border border-dashed border-[var(--ni-sage-mid)] bg-[var(--ni-sage-soft)] px-6 py-12 text-center">
      <div className="max-w-md">
        <span className="ni-verify">{t("tutorClassroom.comingSoon")}</span>
        <p className="mt-3 font-display text-xl ni-t-ink">{title}</p>
        <p className="mt-2 text-sm leading-7 ni-t-muted">{copy}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- room */

export default function TutorClassroomDemo() {
  const { t } = useLocale();
  const [surface, setSurface] = useState<Surface>("board");
  const [full, setFull] = useState(false);
  const roomRef = useRef<HTMLDivElement | null>(null);

  // Fullscreen is the browser's, not a CSS imitation, so the board really does fill the screen.
  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await roomRef.current?.requestFullscreen();
    } catch {
      // Refused (permissions policy, or an older browser). The room stays usable in the page.
    }
  };

  const TABS: { key: Surface; label: string }[] = [
    { key: "quran", label: t("tutorClassroom.tabQuran") },
    { key: "board", label: t("tutorClassroom.tabBoard") },
    { key: "qaida", label: t("tutorClassroom.tabQaida") },
    { key: "uploads", label: t("tutorClassroom.tabUploads") },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-6 lg:py-8">
      <h1 className="font-display text-2xl ni-t-ink">{t("tutorClassroom.title")}</h1>
      <p className="mt-2 max-w-[70ch] text-sm leading-6 ni-t-muted">{t("tutorClassroom.intro")}</p>

      <div ref={roomRef} className="mt-5 rounded-2xl border border-[var(--ni-sage-line)] bg-[var(--ni-paper)] p-4 lg:p-5">
        {/* The video stage, held open rather than faked. */}
        <div className="grid min-h-[9rem] place-items-center rounded-2xl border border-[var(--ni-sage-line)] bg-[var(--ni-teal)] px-5 py-7 text-center">
          <div className="max-w-md">
            <Video size={20} aria-hidden="true" className="mx-auto ni-t-gold-mid" />
            <p className="mt-2.5 font-display text-lg ni-t-on-dark">{t("tutorClassroom.videoStage")}</p>
            <p className="mt-1.5 text-xs leading-6 ni-t-on-dark opacity-80">{t("tutorClassroom.videoSoon")}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="ni-tabs" role="tablist" aria-label={t("tutorClassroom.title")}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={surface === tab.key}
                onClick={() => setSurface(tab.key)}
                // `.ni-tab` styles the selected state off aria-selected, so no second class.
                className="ni-tab"
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={toggleFull} className="ms-auto ni-btn ni-btn--outline px-3 py-1.5 text-sm">
            {full ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
            {full ? t("tutorClassroom.exitFullscreen") : t("tutorClassroom.fullscreen")}
          </button>
        </div>

        <div className="mt-4">
          {surface === "board" && <WhiteBoard />}
          {surface === "quran" && <ComingSoon title={t("tutorClassroom.tabQuran")} copy={t("tutorClassroom.quranSoon")} />}
          {surface === "qaida" && <ComingSoon title={t("tutorClassroom.tabQaida")} copy={t("tutorClassroom.qaidaSoon")} />}
          {surface === "uploads" && <ComingSoon title={t("tutorClassroom.tabUploads")} copy={t("tutorClassroom.uploadsSoon")} />}
        </div>
      </div>
    </div>
  );
}
