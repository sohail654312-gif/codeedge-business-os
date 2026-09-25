import { NextResponse } from "next/server";
import { requireFinanceApiTenant } from "@/server/finance/api";

export async function GET() {
  const auth = await requireFinanceApiTenant();
  if ("errorStatus" in auth) {
    return NextResponse.json({ error:"Unauthorized." },{ status:auth.errorStatus });
  }

  return NextResponse.json({
    error:"This legacy ERPNext Leads route is retired. Use canonical Codeedge CRM Leads.",
    replacement:"/dashboard/buy-from-me/leads",
  },{ status:410 });
}
