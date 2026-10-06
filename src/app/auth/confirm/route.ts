import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/server/db/client";
import { getEnvironment } from "@/server/env";
import { verifiedUser } from "@/server/authorization/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  let destination = "/forgot-password?recovery=invalid";
  // GoTrue token formats include SHA-224 hashes and PKCE-prefixed hashes.
  // Bound input here; Supabase verifies authenticity and single-use expiry.
  if (type === "recovery" && token && /^[A-Za-z0-9_-]{32,256}$/.test(token)) {
    try {
      const client = await createClient();
      const { error } = await client.auth.verifyOtp({ token_hash: token, type: "recovery" });
      if (!error) destination = "/reset-password";
    } catch {
      // No tokens, provider diagnostics or arbitrary redirect targets in output.
    }
  } else if (code && /^[A-Za-z0-9_-]{32,256}$/.test(code)) {
    try {
      const client = await createClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      // Default Supabase email templates use PKCE. Only recovery requests
      // made in this browser can supply the matching HttpOnly verifier cookie.
      if (!error) {
        try {
          await verifiedUser(client);
          destination = "/reset-password";
        } catch {
          await client.auth.signOut({ scope: "local" });
        }
      }
    } catch {
      // Invalid or consumed codes fail closed without exposing diagnostics.
    }
  }
  const response = NextResponse.redirect(new URL(destination, getEnvironment().NEXT_PUBLIC_APP_URL));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
