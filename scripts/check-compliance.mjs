import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const strictSubmission = process.argv.includes("--submission");

const requiredFiles = [
  "README.md",
  "PRIOR_WORK.md",
  "BUILD_LOG.md",
  "DECISIONS.md",
  "HACKATHON_COMPLIANCE.md",
  "LICENSE",
  "SECURITY.md",
  "docs/ARCHITECTURE.md",
  "docs/DEMO_PLAN.md",
  "docs/JUDGING_MAP.md",
  "docs/SUBMISSION_CHECKLIST.md",
];

const requiredReadmePhrases = [
  "## Setup",
  "## Testing",
  "## Sample data",
  "## How Codex and GPT-5.6 are being used",
  "## Judge path",
  "PRIOR_WORK.md",
  "BUILD_LOG.md",
];

const errors = [];
const warnings = [];

for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(root, relativePath))) {
    errors.push(`Missing required file: ${relativePath}`);
  }
}

if (existsSync(resolve(root, "README.md"))) {
  const readme = readFileSync(resolve(root, "README.md"), "utf8");
  for (const phrase of requiredReadmePhrases) {
    if (!readme.includes(phrase)) {
      errors.push(`README is missing required section/reference: ${phrase}`);
    }
  }
}

if (existsSync(resolve(root, "PRIOR_WORK.md"))) {
  const priorWork = readFileSync(resolve(root, "PRIOR_WORK.md"), "utf8");
  for (const evidence of ["9f4323265d036c04d0cf2ca833fac004a38a8a4b", "July 13, 2026", "No source code was copied"]) {
    if (!priorWork.includes(evidence)) {
      errors.push(`PRIOR_WORK.md is missing boundary evidence: ${evidence}`);
    }
  }
}

const checklistPath = resolve(root, "docs/SUBMISSION_CHECKLIST.md");
if (existsSync(checklistPath)) {
  const checklist = readFileSync(checklistPath, "utf8");
  const pendingItems = [...checklist.matchAll(/^- \[ \]/gm)].length;
  if (pendingItems > 0) {
    const message = `${pendingItems} submission checklist item(s) remain open`;
    if (strictSubmission) errors.push(message);
    else warnings.push(message);
  }
}

const buildLogPath = resolve(root, "BUILD_LOG.md");
if (existsSync(buildLogPath)) {
  const buildLog = readFileSync(buildLogPath, "utf8");
  if (/SESSION-ID-PENDING/.test(buildLog)) {
    const message = "The required /feedback Codex Session ID is still pending";
    if (strictSubmission) errors.push(message);
    else warnings.push(message);
  }
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);

if (errors.length > 0) {
  process.exitCode = 1;
} else {
  console.log(strictSubmission ? "Submission compliance check passed." : "Repository baseline check passed.");
}
