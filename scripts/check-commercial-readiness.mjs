#!/usr/bin/env node
// Read-only commercial-acceptance gate; no network, credentials, provider calls or mutations.
// Validation of evidence metadata is NOT external verification of the referenced evidence.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../release/commercial-readiness.json", import.meta.url));
const validStatuses = new Set(["needs_acceptance", "blocked_external", "accepted"]);
const validScopes = new Set(["demo", "pilot"]);
const args = process.argv.slice(2);
const modeIndex = args.indexOf("--mode");
const validationOnly = args.includes("--validate");
const jsonOutput = args.includes("--json");

if (modeIndex >= 0 && !["demo", "pilot"].includes(args[modeIndex + 1])) {
  console.error("Usage: node scripts/check-commercial-readiness.mjs --validate | --mode demo|pilot [--json]");
  process.exit(2);
}
if (!validationOnly && modeIndex < 0) {
  console.error("Specify --validate or --mode demo|pilot.");
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(path, "utf8"));
} catch {
  console.error("Commercial gate manifest is missing or invalid JSON.");
  process.exit(2);
}
const errors = [];
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.gates) || manifest.gates.length === 0) {
  errors.push("schemaVersion must be 1 and gates must be a nonempty array");
}
if (!/^[a-f0-9]{40}$/.test(manifest.baseline?.sha ?? "")) errors.push("baseline must identify an exact 40-character Git SHA");

const ids = new Set();
for (const g of manifest.gates ?? []) {
  if (!/^[DP]\d{2}$/.test(g.id ?? "") || ids.has(g.id)) errors.push("missing/duplicate/invalid gate ID");
  ids.add(g.id);
  if (!validScopes.has(g.scope) || g.id?.[0] !== (g.scope === "demo" ? "D" : "P")) errors.push((g.id ?? "?") + ": invalid scope");
  if (!validStatuses.has(g.status)) errors.push((g.id ?? "?") + ": invalid status");
  if (!g.title || !g.owner || !g.acceptance) errors.push((g.id ?? "?") + ": missing description/owner/acceptance");
  if (!Array.isArray(g.evidence)) errors.push((g.id ?? "?") + ": evidence must be an array");
  if (g.status === "accepted") {
    if (!Array.isArray(g.evidence) || !g.evidence.length) {
      errors.push(g.id + ": accepted status requires reviewed evidence");
      continue;
    }
    for (const e of g.evidence) {
      if (!e || !/^(https:\/\/\S+|docs\/\S+)$/.test(e.url ?? "") ||
          !/^\d{4}-\d\d-\d\d$/.test(e.verifiedAt ?? "") ||
          !/^[a-f0-9]{40}$/.test(e.sha ?? "") ||
          typeof e.reviewer !== "string" || !e.reviewer.trim() ||
          e.reviewed !== true) {
        errors.push(g.id + ": accepted evidence requires URL, YYYY-MM-DD, exact SHA and human reviewer");
      }
    }
  }
}
if (![...ids].some(id => id.startsWith("D")) || ![...ids].some(id => id.startsWith("P"))) {
  errors.push("demo and pilot gate families are both required");
}
if (errors.length) {
  for (const error of errors) console.error("INVALID: " + error);
  process.exit(2);
}
if (validationOnly) {
  console.log("Commercial readiness manifest valid; no feature acceptance inferred.");
  process.exit(0);
}

const mode = args[modeIndex + 1];
const checked = manifest.gates.filter(g => mode === "pilot" || g.scope === "demo");
const outstanding = checked.filter(g => g.status !== "accepted");
const report = {
  mode, eligible: outstanding.length === 0, accepted: checked.length - outstanding.length,
  required: checked.length, outstanding: outstanding.map(g => ({ id: g.id, title: g.title, owner: g.owner, status: g.status }))
};
if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else {
  console.log("Codeedge Business OS " + mode + " acceptance: " + (report.eligible ? "ACCEPTED" : "NOT ACCEPTED"));
  console.log(report.accepted + "/" + report.required + " gates have reviewed evidence.");
  for (const g of report.outstanding) console.log(g.id + " [" + g.status + "] " + g.title + " (" + g.owner + ")");
}
process.exitCode = report.eligible ? 0 : 1;
