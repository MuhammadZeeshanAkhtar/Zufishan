import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../client/src/components/InstructorManagement.tsx", import.meta.url);
const source = await readFile(path, "utf8");
const start = source.indexOf("export function InstructorTraining()");
const end = source.indexOf("export function InstructorAvailability()", start);
if (start < 0 || end < 0) throw new Error("training function boundary not found");
const replacement = `export function InstructorTraining() { const { t } = useLocale(); return <Frame><main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a57f2f]">{t("dashboard.instructor")}</p><h1 className="mt-4 font-display text-5xl">{t("courseStudio.trainingTitle")}</h1><p className="mt-4 text-[#607a70]">{t("courseStudio.trainingSetupNeeded")}</p><div className="mt-8 rounded-2xl bg-[#fff2c9] p-5 text-sm text-[#765b1f]" role="status">{t("courseStudio.trainingPersistenceRequired")}</div></main></Frame>; }\n`;
await writeFile(path, source.slice(0, start) + replacement + source.slice(end));
