import { NextResponse } from "next/server";
import { requireFinanceApiTenant } from "@/server/finance/api";
import { financeStatusHttpContract } from "@/server/finance/http-contract";
import { getFinanceStatus } from "@/server/finance/service";

export async function GET() {
  const auth = await requireFinanceApiTenant();
  if ("errorStatus" in auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: auth.errorStatus });
  }

  try {
    const status = await getFinanceStatus({
      businessId: auth.context.business.id,
      userId: auth.context.userId,
      correlationId: auth.correlationId,
    });
    return NextResponse.json(financeStatusHttpContract(status));
  } catch {
    return NextResponse.json({
      connected: false,
      error: "Finance engine unavailable.",
    }, { status: 502 });
  }
}
