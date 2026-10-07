import "server-only";

export const CIGO_READ_CONTRACT_VERSION = "codeedge-business-os-read-model:v1" as const;
export const CIGO_READ_SOURCE_SYSTEM = "BUSINESS_OS" as const;
export const CIGO_READ_MAX_PAGE = 100;

export const cigoReadResourceKinds = [
  "business_profile",
  "service",
  "lead",
  "customer",
  "crm_activity",
  "booking",
  "inbox_summary",
  "finance_summary",
] as const;

export type CigoReadResourceKind = (typeof cigoReadResourceKinds)[number];

export type CigoOperationalRecord = {
  workspaceId: string;
  reference: {
    sourceSystem: typeof CIGO_READ_SOURCE_SYSTEM;
    externalReference: string;
    version?: string;
  };
  resourceKind: CigoReadResourceKind;
  value: unknown;
  observedAt: string;
};

export type CigoReadEnvelope = {
  contractVersion: typeof CIGO_READ_CONTRACT_VERSION;
  sourceSystem: typeof CIGO_READ_SOURCE_SYSTEM;
  workspaceId: string;
  resourceKind: CigoReadResourceKind;
  observedAt: string;
  records: CigoOperationalRecord[];
  pagination: {
    nextCursor?: string;
  };
  completeness: "COMPLETE" | "PARTIAL";
  errors: Array<{
    code: string;
    message: string;
    retryable: boolean;
  }>;
};

export function isCigoReadResourceKind(value: string): value is CigoReadResourceKind {
  return (cigoReadResourceKinds as readonly string[]).includes(value);
}
