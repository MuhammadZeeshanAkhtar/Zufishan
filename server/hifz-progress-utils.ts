export type HifzProgressRow = { section_type: string; status: string; practice_minutes?: number | null; record_date: string };

const completedStatuses = new Set(["practiced", "submitted_for_review", "reviewed", "approved"]);

export function summarizeHifzProgress(rows: HifzProgressRow[], today = new Date()) {
  const activeDates = new Set(rows.filter((row) => completedStatuses.has(row.status)).map((row) => row.record_date));
  const isoDay = (date: Date) => date.toISOString().slice(0, 10);
  const dayStart = new Date(today);
  dayStart.setUTCHours(0, 0, 0, 0);
  const windowStart = (days: number) => { const value = new Date(dayStart); value.setUTCDate(value.getUTCDate() - (days - 1)); return value; };
  const count = (section: string) => rows.filter((row) => row.section_type === section && completedStatuses.has(row.status)).length;
  const inWindow = (row: HifzProgressRow, start: Date) => new Date(`${row.record_date}T00:00:00Z`) >= start;
  let streakDays = 0;
  const cursor = new Date(dayStart);
  while (activeDates.has(isoDay(cursor))) { streakDays += 1; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  const completed = rows.filter((row) => completedStatuses.has(row.status)).length;
  return {
    totalRecords: rows.length,
    completionPercentage: rows.length ? Math.round((completed / rows.length) * 100) : 0,
    sabaqCompleted: count("sabaq"),
    sabqiCompleted: count("sabqi"),
    manzilCompleted: count("manzil"),
    practiceMinutes: rows.reduce((sum, row) => sum + (row.practice_minutes ?? 0), 0),
    weeklyActivity: rows.filter((row) => inWindow(row, windowStart(7))).length,
    monthlyActivity: rows.filter((row) => inWindow(row, windowStart(30))).length,
    streakDays,
    submitted: rows.filter((row) => row.status === "submitted_for_review").length,
    reviewed: rows.filter((row) => ["reviewed", "approved"].includes(row.status)).length,
    needsRevision: rows.filter((row) => row.status === "needs_revision").length,
  };
}
