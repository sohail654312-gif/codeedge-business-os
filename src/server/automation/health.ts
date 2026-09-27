import "server-only";

import { z } from "zod";
import { withAutomationCapability } from "./capability";

const rowSchema = z.object({
  pending_count: z.coerce.number().int().nonnegative(),
  running_count: z.coerce.number().int().nonnegative(),
  stale_running_count: z.coerce.number().int().nonnegative(),
  oldest_pending_age_seconds: z.coerce.number().int().nonnegative(),
  last_started_at: z.string().nullable(),
  last_completed_at: z.string().nullable(),
});

export async function getAutomationRuntimeHealth() {
  const raw = await withAutomationCapability(async (db) => {
    const result = await db.query(
      "select * from public.automation_runtime_health()",
    );
    return result.rows[0] ?? null;
  });

  const row = rowSchema.parse(raw);
  return {
    healthy: row.stale_running_count === 0
      && row.oldest_pending_age_seconds <= 600,
    pendingCount: row.pending_count,
    runningCount: row.running_count,
    staleRunningCount: row.stale_running_count,
    oldestPendingAgeSeconds: row.oldest_pending_age_seconds,
    lastStartedAt: row.last_started_at,
    lastCompletedAt: row.last_completed_at,
  };
}
