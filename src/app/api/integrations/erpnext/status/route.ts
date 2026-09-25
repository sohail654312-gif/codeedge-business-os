import { NextResponse } from "next/server";
import { requireFinanceApiTenant } from "@/server/finance/api";
import { getFinanceStatus } from "@/server/finance/service";

export async function GET() {
  const auth = await requireFinanceApiTenant();
  if ("errorStatus" in auth) {
    return NextResponse.json({ error:"Unauthorized." },{ status:auth.errorStatus });
  }

  try {
    const status = await getFinanceStatus({
      businessId:auth.context.business.id,
      userId:auth.context.userId,
      correlationId:auth.correlationId,
    });
    return NextResponse.json({
      connected:status.ok,
      message:status.message,
      compatibility:"Codeedge Finance Engine",
    });
  } catch {
    return NextResponse.json({
      connected:false,
      error:"Finance engine unavailable.",
    },{ status:502 });
  }
}
