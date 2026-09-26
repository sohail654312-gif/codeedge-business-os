import type { FinanceEngineStatus } from "./engine";

export function financeStatusHttpContract(status: FinanceEngineStatus) {
  return {
    connected: status.ok,
    message: status.message,
    compatibility: "Codeedge Finance Engine",
  } as const;
}
