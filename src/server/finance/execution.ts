import "server-only";

import { z } from "zod";
import {
  assertExternalEffectAllowed,
  credentialEnvironments,
  executionModes,
  ExternalEffectBlockedError,
} from "@/server/execution/external-effects";
import { financeEngineIds } from "./domain";
import { withFinanceCapability } from "./capability";

const preparedSchema = z.object({
  execution_id: z.string().uuid(),
  connection_id: z.string().uuid(),
  engine: z.enum(financeEngineIds),
  execution_mode: z.enum(executionModes),
  credential_environment: z.enum(credentialEnvironments).nullable(),
  status: z.enum(["prepared","succeeded","failed","ambiguous","simulated"]),
  external_reference: z.string(),
  created: z.boolean(),
});

const externalContextSchema = z.object({
  business_id: z.string().uuid(),
  execution_mode: z.enum(executionModes),
  prepared_execution_mode: z.enum(executionModes),
  engine: z.enum(financeEngineIds),
  credential_environment: z.enum(credentialEnvironments),
  prepared_credential_environment: z.enum(credentialEnvironments),
  correlation_id: z.string().uuid(),
  simulated: z.boolean(),
});

export async function prepareFinanceExecution(input: {
  businessId: string;
  userId: string;
  operation: string;
  documentType: string;
  codeedgeReference: string;
  correlationId: string;
  requestId: string;
}) {
  const raw = await withFinanceCapability(async (db) => {
    const result = await db.query(
      "select * from public.finance_prepare_execution($1,$2,$3,$4,$5,$6,$7)",
      [
        input.businessId,
        input.userId,
        input.operation,
        input.documentType,
        input.codeedgeReference,
        input.correlationId,
        input.requestId,
      ],
    );
    return result.rows[0] ?? null;
  });

  const parsed = preparedSchema.safeParse(raw);
  if (!parsed.success) throw new Error("finance_execution_prepare_failed");
  return parsed.data;
}

export async function requireFinanceExternalEffectAllowed(
  executionId: string,
  expectedEngine: string,
) {
  const raw = await withFinanceCapability(async (db) => {
    const result = await db.query(
      "select * from public.finance_external_effect_context($1)",
      [executionId],
    );
    return result.rows[0] ?? null;
  });

  const parsed = externalContextSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ExternalEffectBlockedError("external_effect_invalid_context");
  }

  if (
    parsed.data.engine !== expectedEngine
    || parsed.data.execution_mode !== parsed.data.prepared_execution_mode
    || parsed.data.credential_environment
      !== parsed.data.prepared_credential_environment
  ) {
    throw new ExternalEffectBlockedError("external_effect_context_changed");
  }

  if (parsed.data.engine === "demo_finance") {
    throw new ExternalEffectBlockedError("external_effect_invalid_context");
  }

  return assertExternalEffectAllowed({
    businessId: parsed.data.business_id,
    executionMode: parsed.data.execution_mode,
    action: "finance.write",
    provider: parsed.data.engine,
    providerEnvironment: parsed.data.credential_environment,
    correlationId: parsed.data.correlation_id,
    simulated: parsed.data.simulated,
  });
}

export async function completeFinanceExecution(input: {
  executionId: string;
  status: "succeeded" | "failed" | "ambiguous" | "simulated";
  externalReference?: string;
  errorCode?: string | null;
}) {
  await withFinanceCapability(async (db) => {
    await db.query(
      "select public.finance_complete_execution($1,$2,$3,$4)",
      [
        input.executionId,
        input.status,
        input.externalReference ?? "",
        input.errorCode ?? null,
      ],
    );
  });
}
