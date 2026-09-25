import "server-only";

import { randomUUID } from "node:crypto";
import { createClient } from "@/server/db/client";
import { AccessError, requireDefaultTenant } from "@/server/authorization/tenant";

export async function requireFinanceApiTenant() {
  const client = await createClient();
  try {
    const context = await requireDefaultTenant(client);
    return { context,correlationId:randomUUID() };
  } catch (error) {
    if (error instanceof AccessError) {
      return { errorStatus:error.status,correlationId:randomUUID() };
    }
    throw error;
  }
}
