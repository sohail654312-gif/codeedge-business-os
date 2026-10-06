import { financeEngineMetadata } from "./provider-metadata";
import type { FinanceCapability,FinanceEngineId } from "./domain";
import { FinanceCapabilityError,type FinanceEngine } from "./engine";
export function requireFinanceWriteCapability(engine:FinanceEngine,capability:FinanceCapability) {
  const metadata = financeEngineMetadata[engine.id as FinanceEngineId];
  if (!metadata || !(metadata.writeCapabilities as readonly FinanceCapability[]).includes(capability)) {
    throw new FinanceCapabilityError(engine.id,capability);
  }
}
