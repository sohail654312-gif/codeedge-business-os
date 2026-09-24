import { NextResponse } from "next/server";
import { getERPNextAuthenticatedUser, getERPNextPublicStatus } from "@/integrations/erpnext";

export async function GET() {
  const status = getERPNextPublicStatus();

  if (!status.configured) {
    return NextResponse.json({
      ...status,
      connected: false,
      message: "ERPNext credentials are not configured yet.",
    });
  }

  try {
    const authenticatedUser = await getERPNextAuthenticatedUser();
    return NextResponse.json({ ...status, connected: true, authenticatedUser });
  } catch (error) {
    return NextResponse.json(
      {
        ...status,
        connected: false,
        error: error instanceof Error ? error.message : "Unknown ERPNext connection error",
      },
      { status: 502 }
    );
  }
}
