import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbQuery: vi.fn(),
  whatsapp: vi.fn(),
  email: vi.fn(),
  sms: vi.fn(),
}));

vi.mock("@/server/automation/capability", () => ({
  withAutomationCapability: async (
    work: (db: { query: typeof mocks.dbQuery }) => Promise<unknown>,
  ) => work({ query: mocks.dbQuery }),
}));

vi.mock("@/server/channels/whatsapp", () => ({
  sendWhatsAppReply: mocks.whatsapp,
}));
vi.mock("@/server/channels/email", () => ({
  sendEmailReply: mocks.email,
}));
vi.mock("@/server/channels/sms", () => ({
  sendSmsReply: mocks.sms,
}));

import {
  evaluateAutomationCondition,
  evaluateAutomationConditions,
  resolveAutomationPath,
} from "@/server/automation/conditions";
import {
  automationConditionSchema,
  automationConditionsSchema,
} from "@/server/automation/domain";
import {
  deterministicAutomationRequestId,
} from "@/server/automation/actions";
import { executeAutomationRun } from "@/server/automation/runner";
import { validateAutomationEvent } from "@/server/automation/triggers";

describe("Automation Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("evaluates declarative conditions without executable code", () => {
    const payload = {
      lead: {
        id: "40000000-0000-4000-8000-000000000001",
        status: "new",
        source: "website_chat",
      },
    };

    expect(resolveAutomationPath(payload, "lead.status")).toBe("new");
    expect(evaluateAutomationCondition(payload, {
      path: "lead.status",
      operator: "eq",
      value: "new",
    })).toBe(true);
    expect(evaluateAutomationConditions(payload, [
      { path: "lead.status", operator: "eq", value: "new" },
      { path: "lead.email", operator: "not_exists" },
    ])).toBe(true);

    expect(() => automationConditionSchema.parse({
      path: "lead.status; DROP TABLE leads",
      operator: "exists",
    })).toThrow();

    expect(() => automationConditionsSchema.parse([
      {
        path: "lead.status",
        operator: "eq",
        value: { executable: "javascript" },
      },
    ])).toThrow();
  });

  it("fails closed for unknown triggers and invalid payloads", () => {
    expect(() => validateAutomationEvent("custom.anything", {}))
      .toThrow("automation_unknown_trigger");

    expect(() => validateAutomationEvent("lead.created", {
      lead: { id: "not-a-uuid" },
    })).toThrow("automation_invalid_event_payload");
  });

  it("creates stable distinct request ids for retry-safe external actions", () => {
    const runId = "90000000-0000-4000-8000-000000000001";
    const first = deterministicAutomationRequestId(runId, 0);
    const retry = deterministicAutomationRequestId(runId, 0);
    const secondAction = deterministicAutomationRequestId(runId, 1);

    expect(retry).toBe(first);
    expect(secondAction).not.toBe(first);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("dry-runs external actions in Demo without calling a provider", async () => {
    const runId = "90000000-0000-4000-8000-000000000001";
    const records: unknown[][] = [];
    let completed: unknown[] | null = null;

    mocks.dbQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("automation_load_run")) {
        return {
          rows: [{
            run_id: runId,
            business_id: "20000000-0000-4000-8000-000000000001",
            workflow_id: "91000000-0000-4000-8000-000000000001",
            workflow_version: 1,
            trigger_type: "message.received",
            conditions: [{
              path: "conversation.channel",
              operator: "eq",
              value: "whatsapp",
            }],
            actions: [{
              type: "communication.send_whatsapp",
              conversationIdPath: "conversation.id",
              body: "Thanks — we received your message.",
            }],
            actor_user_id: "10000000-0000-4000-8000-000000000001",
            event_id: "92000000-0000-4000-8000-000000000001",
            event_type: "message.received",
            subject_type: "conversation",
            subject_id: "66000000-0000-4000-8000-000000000001",
            payload: {
              message: {
                id: "67000000-0000-4000-8000-000000000001",
                sender_type: "customer",
                direction: "inbound",
              },
              conversation: {
                id: "66000000-0000-4000-8000-000000000001",
                channel: "whatsapp",
              },
            },
            execution_mode: "demo",
            correlation_id: "93000000-0000-4000-8000-000000000001",
          }],
        };
      }

      if (sql.includes("automation_record_action")) {
        records.push(params ?? []);
        return { rows: [{ automation_record_action: "ok" }] };
      }

      if (sql.includes("automation_complete_run")) {
        completed = params ?? [];
        return { rows: [{ automation_complete_run: null }] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(executeAutomationRun(runId)).resolves.toEqual({
      runId,
      status: "succeeded",
    });

    expect(mocks.whatsapp).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
    expect(mocks.sms).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0]?.[3]).toBe("simulated");
    expect(records[0]?.[4]).toBe(true);
    expect(completed?.[1]).toBe("succeeded");
  });
});
