import "server-only";

import { z } from "zod";
import { financeEngineIds, type FinanceExecutionContext } from "./domain";
import { withFinanceCapability } from "./capability";

const contextSchema = z.object({
  business_id: z.string().uuid(),
  execution_mode: z.enum(["demo","sandbox","production"]),
  connection_id: z.string().uuid(),
  engine: z.enum(financeEngineIds),
  external_account_id: z.string(),
  credential_key: z.string(),
  credential_environment: z.enum(["sandbox","production"]).nullable(),
  default_currency: z.string().regex(/^[A-Z]{3}$/),
});

export type LoadedFinanceContext = FinanceExecutionContext & {
  externalAccountId: string;
  credentialKey: string;
  defaultCurrency: string;
};

export async function loadFinanceContext(input: {
  businessId: string;
  userId: string;
  correlationId: string;
}): Promise<LoadedFinanceContext> {
  const raw = await withFinanceCapability(async (db) => {
    const result = await db.query(
      "select * from public.finance_active_context($1,$2)",
      [input.businessId,input.userId],
    );
    return result.rows[0] ?? null;
  });

  const parsed = contextSchema.safeParse(raw);
  if (!parsed.success) throw new Error("finance_context_unavailable");

  return {
    businessId: parsed.data.business_id,
    userId: input.userId,
    executionMode: parsed.data.execution_mode,
    engine: parsed.data.engine,
    connectionId: parsed.data.connection_id,
    credentialEnvironment: parsed.data.credential_environment,
    correlationId: input.correlationId,
    externalAccountId: parsed.data.external_account_id,
    credentialKey: parsed.data.credential_key,
    defaultCurrency: parsed.data.default_currency,
  };
}
