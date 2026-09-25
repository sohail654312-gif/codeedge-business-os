import { NextRequest, NextResponse } from "next/server";
import { requireFinanceApiTenant } from "@/server/finance/api";
import { getMoneySales } from "@/server/finance/service";

export async function GET(request: NextRequest) {
  const auth = await requireFinanceApiTenant();
  if ("errorStatus" in auth) {
    return NextResponse.json({ error:"Unauthorized." },{ status:auth.errorStatus });
  }
  const requested = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested,1),100) : 20;

  try {
    const sales = await getMoneySales({
      businessId:auth.context.business.id,
      userId:auth.context.userId,
      correlationId:auth.correlationId,
    });
    return NextResponse.json({
      data:(sales.quotes ?? []).slice(0,limit),
      compatibility:"Codeedge Finance Engine",
    });
  } catch {
    return NextResponse.json({ error:"Finance quotations unavailable." },{ status:502 });
  }
}
