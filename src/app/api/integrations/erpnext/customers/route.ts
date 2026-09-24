import { NextRequest, NextResponse } from "next/server";
import { getERPNextPublicStatus, listERPNextCustomers } from "@/integrations/erpnext";

export async function GET(request: NextRequest) {
  if (!getERPNextPublicStatus().configured) {
    return NextResponse.json({ error: "ERPNext is not configured." }, { status: 503 });
  }

  const requested = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 20;

  try {
    const result = await listERPNextCustomers(limit);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ERPNext request failed." },
      { status: 502 }
    );
  }
}
