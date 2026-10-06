import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { authorizeCigoReadRequest } from "@/server/cigo/auth";
import {
  CIGO_READ_CONTRACT_VERSION,
  CIGO_READ_MAX_PAGE,
  CIGO_READ_SOURCE_SYSTEM,
  isCigoReadResourceKind,
  type CigoReadEnvelope,
} from "@/server/cigo/contract";
import { cigoReadCursorCodecFromEnvironment } from "@/server/cigo/cursor";
import { readCigoProjection } from "@/server/cigo/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const businessIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number, requestId: string) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Codeedge-Request-Id": requestId,
    },
  });
}

function parseLimit(value: string | null) {
  if (value === null) return CIGO_READ_MAX_PAGE;
  if (!/^[1-9]\d{0,2}$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit <= CIGO_READ_MAX_PAGE
    ? limit
    : null;
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
  const resourceKind = request.nextUrl.searchParams.get("resourceKind") ?? "";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;

  if (
    !businessIdPattern.test(workspaceId)
    || !isCigoReadResourceKind(resourceKind)
    || limit === null
    || (cursor !== undefined && (!cursor || cursor.length > 4096))
  ) {
    return json({ error: "Invalid read request." }, 400, requestId);
  }

  try {
    authorizeCigoReadRequest({
      workspaceId,
      keyId: request.headers.get("x-codeedge-cigo-key-id"),
      authorization: request.headers.get("authorization"),
    });
  } catch {
    return json({ error: "Unauthorized." }, 401, requestId);
  }

  try {
    const codec = cigoReadCursorCodecFromEnvironment();
    const scope = { workspaceId, resourceKind, limit };
    const decoded = cursor === undefined ? undefined : codec.decode(scope, cursor);
    if (cursor !== undefined && !decoded) {
      return json({ error: "Invalid read request." }, 400, requestId);
    }

    const page = await readCigoProjection({
      workspaceId,
      resourceKind,
      limit,
      ...(decoded ? { cursor: decoded } : {}),
    });

    const observedAt = new Date().toISOString();
    const nextCursor = page.nextState
      ? codec.encode(scope, page.nextState)
      : undefined;

    const envelope: CigoReadEnvelope = {
      contractVersion: CIGO_READ_CONTRACT_VERSION,
      sourceSystem: CIGO_READ_SOURCE_SYSTEM,
      workspaceId,
      resourceKind,
      observedAt,
      records: page.records,
      pagination: {
        ...(nextCursor ? { nextCursor } : {}),
      },
      completeness: "COMPLETE",
      errors: [],
    };
    return json(envelope, 200, requestId);
  } catch {
    const envelope: CigoReadEnvelope = {
      contractVersion: CIGO_READ_CONTRACT_VERSION,
      sourceSystem: CIGO_READ_SOURCE_SYSTEM,
      workspaceId,
      resourceKind,
      observedAt: new Date().toISOString(),
      records: [],
      pagination: {},
      completeness: "PARTIAL",
      errors: [{
        code: "SOURCE_UNAVAILABLE",
        message: "Business OS read boundary unavailable.",
        retryable: true,
      }],
    };
    return json(envelope, 503, requestId);
  }
}
