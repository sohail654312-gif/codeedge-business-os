import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const REQUIRED_PATCH = "15.5.27";
const readJson = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

const manifest = readJson("../package.json");
const lock = readJson("../package-lock.json");
const installedNext = readJson("../node_modules/next/package.json");
const installedEslint = readJson("../node_modules/eslint-config-next/package.json");

const checks = [
  ["manifest next", manifest.dependencies.next],
  ["manifest eslint-config-next", manifest.devDependencies["eslint-config-next"]],
  ["lock root next", lock.packages[""].dependencies.next],
  ["lock root eslint-config-next", lock.packages[""].devDependencies["eslint-config-next"]],
  ["lock installed next", lock.packages["node_modules/next"].version],
  ["lock installed eslint-config-next", lock.packages["node_modules/eslint-config-next"].version],
  ["installed next", installedNext.version],
  ["installed eslint-config-next", installedEslint.version],
];

for (const [label, version] of checks) {
  assert.equal(version, REQUIRED_PATCH, `${label}: expected patched version ${REQUIRED_PATCH}, got ${version}`);
}

for (const [path, metadata] of Object.entries(lock.packages)) {
  if (/^node_modules\/@next\/(?:env|eslint-plugin-next|swc-)/.test(path)) {
    assert.equal(metadata.version, REQUIRED_PATCH, `${path} does not match patched framework version`);
  }
}

console.log(`Part 5 framework provenance verified: installed Next.js ${installedNext.version}, installed eslint-config-next ${installedEslint.version}; manifest, lockfile, and @next packages agree.`);
