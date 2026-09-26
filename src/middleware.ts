import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEnvironmentIfConfigured } from "@/server/env";
import type { Database } from "@/types/database";
import { applySecurityHeaders } from "@/server/http/security-headers";

export async function middleware(request: NextRequest) {
  const env = getEnvironmentIfConfigured();
  let response = NextResponse.next({ request });

  if (!env) {
    applySecurityHeaders(response.headers, {
      pathname: request.nextUrl.pathname,
      protocol: request.nextUrl.protocol,
    });
    return response;
  }

  const client = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NEXT_PUBLIC_APP_URL.startsWith("https:"),
        path: "/",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await client.auth.getUser();
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  applySecurityHeaders(response.headers, {
    pathname: request.nextUrl.pathname,
    protocol: request.nextUrl.protocol,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
