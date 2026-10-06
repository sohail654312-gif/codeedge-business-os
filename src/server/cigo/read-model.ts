import "server-only";

import type { QueryResultRow } from "pg";
import { withCigoReadCapability } from "./capability";
import {
  CIGO_READ_SOURCE_SYSTEM,
  type CigoOperationalRecord,
  type CigoReadResourceKind,
} from "./contract";
import type { CigoReadCursorState } from "./cursor";

type ProjectionRow = QueryResultRow & {
  record: unknown;
  sort_time: string;
  sort_id: string;
};

type ProjectedValue = {
  externalReference: string;
  version: string;
  observedAt: string;
  value: unknown;
};

function projectedValue(value: unknown): ProjectedValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid CIGO projection row.");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.externalReference !== "string"
    || !row.externalReference
    || row.externalReference.length > 255
    || typeof row.version !== "string"
    || !row.version
    || row.version.length > 128
    || typeof row.observedAt !== "string"
    || !Number.isFinite(Date.parse(row.observedAt))
  ) {
    throw new Error("Invalid CIGO projection row.");
  }
  return {
    externalReference: row.externalReference,
    version: row.version,
    observedAt: new Date(row.observedAt).toISOString(),
    value: row.value,
  };
}

export async function readCigoProjection(input: {
  workspaceId: string;
  resourceKind: CigoReadResourceKind;
  limit: number;
  cursor?: CigoReadCursorState;
}): Promise<{
  records: CigoOperationalRecord[];
  nextState?: CigoReadCursorState;
}> {
  const requested = input.limit + 1;
  const result = await withCigoReadCapability((db) => db.query<ProjectionRow>(
    `select
       record,
       sort_time::text as sort_time,
       sort_id
     from public.cigo_read_v1($1::uuid,$2::text,$3::integer,$4::timestamptz,$5::text)`,
    [
      input.workspaceId,
      input.resourceKind,
      requested,
      input.cursor?.afterTime ?? null,
      input.cursor?.afterId ?? "",
    ],
  ));

  if (!result || !Array.isArray(result.rows) || result.rows.length > requested) {
    throw new Error("Invalid CIGO projection result.");
  }

  const hasMore = result.rows.length > input.limit;
  const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  const records = rows.map((row) => {
    const value = projectedValue(row.record);
    return {
      workspaceId: input.workspaceId,
      reference: {
        sourceSystem: CIGO_READ_SOURCE_SYSTEM,
        externalReference: value.externalReference,
        version: value.version,
      },
      resourceKind: input.resourceKind,
      value: value.value,
      observedAt: value.observedAt,
    };
  });

  if (!hasMore || !rows.length) return { records };
  const last = rows.at(-1)!;
  if (
    typeof last.sort_time !== "string"
    || !Number.isFinite(Date.parse(last.sort_time))
    || typeof last.sort_id !== "string"
    || !last.sort_id
    || last.sort_id.length > 255
  ) {
    throw new Error("Invalid CIGO projection cursor state.");
  }

  return {
    records,
    nextState: {
      afterTime: new Date(last.sort_time).toISOString(),
      afterId: last.sort_id,
    },
  };
}
