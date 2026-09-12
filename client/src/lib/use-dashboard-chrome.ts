/**
 * Whether the current route already has the dashboard's persistent navigation.
 *
 * `DashboardChrome` renders the sidebar for `/dashboard/learner`, `/dashboard/instructor`
 * and `/dashboard/admin` and their children, and renders nothing for every other path.
 * The same module shells are used on both sides of that line — `LearnerShell` dresses
 * both `/dashboard/learner/courses/:id` and the standalone `/enrol/:courseId` — so a
 * shell cannot know from its own props whether a back control is redundant or the only
 * way out.
 *
 * Asking the location settles it: inside the dashboard the sidebar is already there and
 * a "Back to dashboard" link is a second copy of it; on a standalone page, a deep link
 * or a step in a flow there is no sidebar, and the control stays.
 *
 * The pattern is deliberately the same one `roleForPath` uses in DashboardChrome, so the
 * two cannot disagree about where the chrome is.
 */
import { useLocation } from "wouter";

const DASHBOARD_PATH = /^\/dashboard\/(learner|instructor|admin)(\/|$)/;

export function useHasDashboardChrome(): boolean {
  const [location] = useLocation();
  return DASHBOARD_PATH.test(location);
}
