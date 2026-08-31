import fs from "node:fs";
const path = "/home/ubuntu/noor-ilm-lms/client/src/App.tsx";
const source = fs.readFileSync(path, "utf8");
const replacement = fs.readFileSync("/home/ubuntu/noor-ilm-lms/scripts/dashboard-snippet.txt", "utf8");
const pattern = /function DashboardShell[\s\S]*?\nfunction HowItWorksPage/;
if (!pattern.test(source)) throw new Error("DashboardShell block not found");
fs.writeFileSync(path, source.replace(pattern, replacement + "function HowItWorksPage"));
