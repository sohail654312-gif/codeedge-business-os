import "server-only";

import { z } from "zod";
import { automationActionRegistry, executeAutomationAction } from "./actions";
import { withAutomationCapability } from "./capability";
import { evaluateAutomationConditions } from "./conditions";
import {
  automationActionsSchema,
  automationConditionsSchema,
  type AutomationRunContext,
} from "./domain";
import { validateAutomationEvent } from "./triggers";

const claimedRunSchema = z.object({
  run_id: z.string().uuid(),
});

const loadedRunSchema = z.object({
  run_id: z.string().uuid(),
  business_id: z.string().uuid(),
  workflow_id: z.string().uuid(),
  workflow_version: z.number().int().positive(),
  trigger_type: z.string().min(1),
  conditions: z.unknown(),
  actions: z.unknown(),
  actor_user_id: z.string().uuid(),
  event_id: z.string().uuid(),
  event_type: z.string().min(1),
  subject_type: z.string().min(1),
  subject_id: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
  execution_mode: z.enum(["demo", "sandbox", "production"]),
  correlation_id: z.string().uuid(),
});

async function completeRun(
  runId: string,
  status: "succeeded" | "skipped" | "failed",
  errorCode: string | null = null,
) {
  await withAutomationCapability(async (db) => {
    await db.query(
      "select public.automation_complete_run($1,$2,$3)",
      [runId, status, errorCode],
    );
  });
}

async function recordAction(input: {
  runId: string;
  actionIndex: number;
  actionType: string;
  status: "succeeded" | "simulated" | "failed";
  externalEffect: boolean;
  result?: Record<string, unknown>;
  errorCode?: string | null;
}) {
  await withAutomationCapability(async (db) => {
    await db.query(
      "select public.automation_record_action($1,$2,$3,$4,$5,$6,$7)",
      [
        input.runId,
        input.actionIndex,
        input.actionType,
        input.status,
        input.externalEffect,
        input.result ?? {},
        input.errorCode ?? null,
      ],
    );
  });
}

function errorCode(error: unknown) {
  if (error instanceof z.ZodError) return "automation_invalid_configuration";
  if (error instanceof Error && /^automation_[a-z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return "automation_action_failed";
}

export async function executeAutomationRun(runId: string) {
  const raw = await withAutomationCapability(async (db) => {
    const result = await db.query(
      "select * from public.automation_load_run($1)",
      [runId],
    );
    return result.rows[0] ?? null;
  });

  const parsed = loadedRunSchema.safeParse(raw);
  if (!parsed.success) {
    await completeRun(runId, "failed", "automation_invalid_run");
    return { runId, status: "failed" as const };
  }

  const run = parsed.data;

  try {
    if (run.trigger_type !== run.event_type) {
      throw new Error("automation_trigger_mismatch");
    }

    const payload = validateAutomationEvent(run.event_type, run.payload);
    const conditions = automationConditionsSchema.parse(run.conditions);
    const actions = automationActionsSchema.parse(run.actions);

    if (!evaluateAutomationConditions(payload, conditions)) {
      await completeRun(run.run_id, "skipped");
      return { runId: run.run_id, status: "skipped" as const };
    }

    const context: AutomationRunContext = {
      runId: run.run_id,
      businessId: run.business_id,
      actorUserId: run.actor_user_id,
      executionMode: run.execution_mode,
      correlationId: run.correlation_id,
      payload,
    };

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const registration = automationActionRegistry[action.type];

      if (run.execution_mode === "demo" && registration.externalEffect) {
        await recordAction({
          runId: run.run_id,
          actionIndex: index,
          actionType: action.type,
          status: "simulated",
          externalEffect: true,
          result: {
            dryRun: true,
            reason: "demo_external_effect_blocked",
          },
        });
        continue;
      }

      try {
        const result = await executeAutomationAction(context, action, index);
        await recordAction({
          runId: run.run_id,
          actionIndex: index,
          actionType: action.type,
          status: "succeeded",
          externalEffect: registration.externalEffect,
          result,
        });
      } catch (error) {
        const code = errorCode(error);
        await recordAction({
          runId: run.run_id,
          actionIndex: index,
          actionType: action.type,
          status: "failed",
          externalEffect: registration.externalEffect,
          errorCode: code,
        });
        await completeRun(run.run_id, "failed", code);
        return { runId: run.run_id, status: "failed" as const };
      }
    }

    await completeRun(run.run_id, "succeeded");
    return { runId: run.run_id, status: "succeeded" as const };
  } catch (error) {
    const code = errorCode(error);
    await completeRun(run.run_id, "failed", code);
    return { runId: run.run_id, status: "failed" as const };
  }
}

export async function runPendingAutomations(limit = 10) {
  const raw = await withAutomationCapability(async (db) => {
    const result = await db.query(
      "select * from public.automation_claim_runs($1)",
      [Math.max(1, Math.min(limit, 50))],
    );
    return result.rows;
  });

  const claimed = z.array(claimedRunSchema).parse(raw);
  const results = [];
  for (const run of claimed) {
    results.push(await executeAutomationRun(run.run_id));
  }
  return results;
}
