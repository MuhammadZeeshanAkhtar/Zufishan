import { readFileSync, writeFileSync } from "node:fs";
const path = "client/src/components/SchedulingExperience.tsx";
const source = readFileSync(path, "utf8");
const replacement = `export function TrialDetail({ id, instructor = false }: { id: string; instructor?: boolean }) {
  const request = getTrialRequest(id);
  const [feedback, setFeedback] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  if (!request) return <Shell><main className="mx-auto max-w-3xl px-5 py-20"><h1 className="font-display text-4xl text-[#17483f]">Request not found.</h1></main></Shell>;
  const respond = (action: "accept" | "reject" | "propose") => setFeedback(respondToTrialRequest(id, action).message || "Action prepared.");
  const safetyAction = (action: "cancel" | "no-show" | "report") => {
    if (!reason || !confirmed) { setFeedback("Choose a reason and confirm this action before continuing."); return; }
    setFeedback(action === "report" ? "Report prepared in demo mode. It remains private and no notification was sent." : \\\`\\\${action === "no-show" ? "No-show" : "Cancellation"} prepared in demo mode. No status was changed.\\\`);
  };
  return <Shell eyebrow={instructor ? "Request detail" : "Trial detail"}><main className="mx-auto max-w-4xl px-5 py-12 lg:px-8 lg:py-16">
    <Link href={instructor ? "/dashboard/instructor/trial-requests" : "/dashboard/learner/trial-lessons"} className="text-sm font-bold text-[#0e5a4f]">← Back to list</Link>
    <h1 className="mt-8 font-display text-5xl text-[#17483f]">{request.courseTitle || request.subject}</h1>
    <p className="mt-3 text-[#607a70]">{request.learnerDisplayName} · {request.instructorName}</p>
    <div className="mt-8"><Status status={request.status}/></div>
    <div className="mt-5"><TimeBlock start={request.proposedStartAt || request.requestedStartAt} end={request.proposedEndAt || request.requestedEndAt} learnerTimezone={request.learnerTimezone} instructorTimezone={request.instructorTimezone}/></div>
    <div className="mt-5 grid gap-5 sm:grid-cols-2"><Card><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a57f2f]">Learning context</p><p className="mt-3 text-sm leading-7 text-[#607a70]">{request.learningGoal}<br/>{request.learnerMessage}</p></Card><Card><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a57f2f]">Timeline</p><p className="mt-3 text-sm leading-7 text-[#607a70]">Requested · Viewed · Proposed new time</p><p className="mt-2 text-xs text-[#8a9b91]">Internal notifications are demo placeholders.</p></Card></div>
    <div className="mt-7 flex flex-wrap gap-3">{instructor ? <><button onClick={() => respond("accept")} className="rounded-full bg-[#0e5a4f] px-5 py-3 text-sm font-bold text-white">Accept</button><button onClick={() => respond("propose")} className="rounded-full border border-[#9db9ab] px-5 py-3 text-sm font-bold text-[#0e5a4f]">Propose new time</button><button onClick={() => { if (!reason || !confirmed) setFeedback("Choose a reason and confirm before rejecting."); else respond("reject"); }} className="rounded-full bg-[#fff1ee] px-5 py-3 text-sm font-bold text-[#8d3d34]">Reject</button></> : <><button onClick={() => setFeedback("Proposed time accepted in demo mode; no session was persisted.")} className="rounded-full bg-[#0e5a4f] px-5 py-3 text-sm font-bold text-white">Accept proposed time</button><button onClick={() => setFeedback("Proposal declined in demo mode; no notification was sent.")} className="rounded-full bg-[#edf2ea] px-5 py-3 text-sm font-bold text-[#17483f]">Decline</button><Link href={\
\`/classroom/\${demoSessions[0]?.id}/waiting-room\`} className="rounded-full border border-[#9db9ab] px-5 py-3 text-sm font-bold text-[#0e5a4f]">Waiting room</Link></>}</div>
    <Card><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a57f2f]">Safety actions</p><h2 className="mt-3 font-display text-2xl text-[#17483f]">Need to change or report something?</h2><select value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-4 w-full"><option value="">Choose a reason</option><option value="schedule">Schedule problem</option><option value="technical">Technical issue</option><option value="missed">Missed class</option><option value="conduct">Inappropriate behaviour</option></select><label className="mt-4 flex gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}/>I understand this action is private and may require policy review.</label><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => safetyAction("cancel")} className="rounded-full bg-[#fff1ee] px-4 py-2 text-sm font-bold text-[#8d3d34]">Cancel session</button><button onClick={() => safetyAction("no-show")} className="rounded-full border border-[#d9c88b] px-4 py-2 text-sm font-bold text-[#765b1f]">Mark no-show</button><button onClick={() => safetyAction("report")} className="rounded-full bg-[#edf2ea] px-4 py-2 text-sm font-bold text-[#17483f]">Report / help</button></div></Card>
    {feedback && <p className="mt-5 rounded-xl bg-[#f4ead0] p-4 text-sm text-[#765b1f]" role="status">{feedback}</p>}
  </main></Shell>;
}
`;
const pattern = /export function TrialDetail[\s\S]*?\nexport function SchedulePage/;
if (!pattern.test(source)) throw new Error("TrialDetail block not found");
writeFileSync(path, source.replace(pattern, replacement + "export function SchedulePage"));
