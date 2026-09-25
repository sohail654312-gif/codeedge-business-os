import "server-only";

import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b]) => a.localeCompare(b))
        .map(([key,item]) => [key,canonical(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonical(value));
}

export function sha256Json(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
