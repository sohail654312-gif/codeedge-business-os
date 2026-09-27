import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "CHAT_DATABASE_URL",
  "COMMUNICATION_DATABASE_URL",
  "AUTOMATION_RUNNER_SECRET",
] as const;

export async function GET() {
  const configured = required.filter((name) => Boolean(process.env[name]));
  const ready = configured.length === required.length;

  return NextResponse.json(
    {
      status: ready ? "ready" : "not_ready",
      configured: configured.length,
      required: required.length,
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
