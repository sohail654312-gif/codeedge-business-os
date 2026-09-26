export type SecurityHeaderInput = {
  pathname: string;
  protocol: string;
};

export function securityHeadersForRequest(input: SecurityHeaderInput) {
  const embeddableChatPreview =
    input.pathname === "/chat" || input.pathname.startsWith("/chat/");

  const headers: Record<string, string> = {
    "Content-Security-Policy": embeddableChatPreview
      ? "frame-ancestors *; object-src 'none'; base-uri 'none'"
      : "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };

  if (input.protocol === "https:") {
    headers["Strict-Transport-Security"] = "max-age=31536000";
  }

  return headers;
}

export function applySecurityHeaders(
  headers: Headers,
  input: SecurityHeaderInput,
) {
  for (const [name, value] of Object.entries(securityHeadersForRequest(input))) {
    headers.set(name, value);
  }
}
