import { describe, expect, it } from "vitest";
import { securityHeadersForRequest } from "@/server/http/security-headers";

describe("browser security headers", () => {
  it("prevents framing of authenticated and ordinary application routes", () => {
    const headers = securityHeadersForRequest({
      pathname: "/dashboard",
      protocol: "https:",
    });

    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000");
  });

  it("keeps the public Website Chat preview intentionally embeddable", () => {
    const headers = securityHeadersForRequest({
      pathname: "/chat/71000000-0000-4000-8000-000000000001",
      protocol: "https:",
    });

    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors *");
    expect(headers["Content-Security-Policy"]).not.toContain("frame-ancestors 'none'");
  });

  it("does not claim HSTS on a non-HTTPS request", () => {
    const headers = securityHeadersForRequest({
      pathname: "/api/website-chat/71000000-0000-4000-8000-000000000001",
      protocol: "http:",
    });

    expect(headers["Strict-Transport-Security"]).toBeUndefined();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});
