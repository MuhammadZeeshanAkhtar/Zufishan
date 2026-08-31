import fs from "node:fs";
const path = "/home/ubuntu/noor-ilm-lms/client/src/App.tsx";
let source = fs.readFileSync(path, "utf8");
if (!source.includes('import DashboardOverview')) source = source.replace('import { DashboardSubpage } from "./components/DashboardSubpage";', 'import { DashboardSubpage } from "./components/DashboardSubpage";\nimport DashboardOverview from "./components/DashboardOverview";');
const replacement = 'function DashboardShell({ role }: { role: "learner" | "instructor" | "admin" }) { return <DashboardOverview role={role} />; }\nfunction HowItWorksPage';
const pattern = /function DashboardShell[\s\S]*?\nfunction HowItWorksPage/;
if (!pattern.test(source)) throw new Error("DashboardShell block not found");
fs.writeFileSync(path, source.replace(pattern, replacement));
