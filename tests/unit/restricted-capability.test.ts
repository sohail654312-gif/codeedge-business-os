import type { PoolClient, PoolConfig } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  createRestrictedCapability,
  validateRestrictedDatabaseConnection,
} from "@/server/db/restricted-capability";
import { communicationCapabilityConfig } from "@/server/channels/capability";
import { websiteChatCapabilityConfig } from "@/server/website-chat/capability";
import { voiceCapabilityConfig } from "@/server/voice/capability";
import { automationCapabilityConfig } from "@/server/automation/capability";
import { financeCapabilityConfig } from "@/server/finance/capability";
import { aiCapabilityConfig } from "@/server/ai/capability";

function harness(options: {
  role?: "codeedge_finance_api";
  workFails?: boolean;
  rollbackFails?: boolean;
} = {}) {
  const queries: string[] = [];
  const release = vi.fn();
  const createPool = vi.fn((config: PoolConfig) => ({
    config,
    connect: async () => ({
      query: (async (sql: string) => {
        queries.push(sql);
        if (sql === "ROLLBACK" && options.rollbackFails) {
          throw new Error("rollback_failed");
        }
        return { rows: [] };
      }) as PoolClient["query"],
      release,
    }),
  }));

  const capability = createRestrictedCapability({
    label: "Finance",
    connectionString: () => (
      "postgresql://app@localhost/codeedge"
    ),
    role: options.role ?? "codeedge_finance_api",
    pool: {
      max: 3,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 12000,
    },
    transaction: {
      statementTimeoutMillis: 12000,
      lockTimeoutMillis: 3000,
      idleTransactionTimeoutMillis: 15000,
    },
  }, { createPool });

  const work = async () => {
    if (options.workFails) throw new Error("work_failed");
    return "ok";
  };

  return { capability, createPool, queries, release, work };
}

describe("restricted database capability infrastructure", () => {
  it("fails closed when verified TLS is absent for a remote database", () => {
    expect(() => validateRestrictedDatabaseConnection(
      "postgresql://app@example.test/codeedge",
      "Finance",
    )).toThrow(/verified TLS/i);

    expect(() => validateRestrictedDatabaseConnection(
      "postgresql://app@example.test/codeedge?sslmode=require",
      "Finance",
    )).toThrow(/verified TLS/i);

    expect(() => validateRestrictedDatabaseConnection(
      "postgresql://app@example.test/codeedge?sslmode=verify-full&uselibpqcompat=true",
      "Finance",
    )).toThrow(/verified TLS/i);

    expect(validateRestrictedDatabaseConnection(
      "postgresql://app@example.test/codeedge?sslmode=verify-full",
      "Finance",
    )).toContain("sslmode=verify-full");

    expect(validateRestrictedDatabaseConnection(
      "postgresql://app@localhost/codeedge",
      "Finance",
    )).toContain("localhost");
  });

  it("keeps capability roles domain-specific", () => {
    expect([
      communicationCapabilityConfig.role,
      websiteChatCapabilityConfig.role,
      voiceCapabilityConfig.role,
      automationCapabilityConfig.role,
      financeCapabilityConfig.role,
      aiCapabilityConfig.role,
    ]).toEqual([
      "codeedge_communication_api",
      "codeedge_chat_api",
      "codeedge_voice_api",
      "codeedge_automation_api",
      "codeedge_finance_api",
      "codeedge_ai_api",
    ]);
  });

  it("uses a bounded pool and commits successful work", async () => {
    const item = harness();
    await expect(item.capability.withCapability(item.work)).resolves.toBe("ok");

    expect(item.capability.poolMax).toBe(3);
    expect(item.createPool).toHaveBeenCalledWith(expect.objectContaining({
      max: 3,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 12000,
    }));
    expect(item.queries).toEqual([
      "BEGIN",
      "SET LOCAL statement_timeout='12000ms'",
      "SET LOCAL lock_timeout='3000ms'",
      "SET LOCAL idle_in_transaction_session_timeout='15000ms'",
      "SET LOCAL ROLE codeedge_finance_api",
      "COMMIT",
    ]);
    expect(item.release).toHaveBeenCalledWith(false);
  });

  it("rolls back failed work and releases a healthy client", async () => {
    const item = harness({ workFails: true });

    await expect(item.capability.withCapability(item.work))
      .rejects.toThrow("work_failed");
    expect(item.queries.at(-1)).toBe("ROLLBACK");
    expect(item.release).toHaveBeenCalledWith(false);
  });

  it("discards a client when rollback itself fails", async () => {
    const item = harness({ workFails: true, rollbackFails: true });

    await expect(item.capability.withCapability(item.work))
      .rejects.toThrow("work_failed");
    expect(item.release).toHaveBeenCalledWith(true);
  });
});
