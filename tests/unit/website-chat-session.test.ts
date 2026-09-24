import { describe, expect, it } from "vitest";
import {
  hashVisitorSessionToken,
  newVisitorSessionToken,
} from "@/server/website-chat/session";
import { readWebsiteChatBody, websiteChatCorsHeaders } from "@/server/website-chat/http";
import { renderWebsiteChatEmbedScript } from "@/server/website-chat/embed";

describe("Website Chat session and transport helpers", () => {
  it("creates unpredictable 256-bit visitor tokens and stores only hashes", () => {
    const first = newVisitorSessionToken();
    const second = newVisitorSessionToken();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
    expect(hashVisitorSessionToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashVisitorSessionToken(first)).not.toBe(first);
    expect(() => hashVisitorSessionToken("bad")).toThrow();
  });

  it("bounds JSON request bodies without trusting content-length", async () => {
    await expect(readWebsiteChatBody(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(17_000) }),
    }))).rejects.toThrow("Request too large");
  });

  it("requires JSON", async () => {
    await expect(readWebsiteChatBody(new Request("http://localhost", {
      method: "POST",
      body: "hello",
    }))).rejects.toThrow("JSON required");
  });

  it("exposes cross-origin capability headers without credentials", () => {
    expect(websiteChatCorsHeaders["Access-Control-Allow-Origin"]).toBe("*");
    expect(websiteChatCorsHeaders["Access-Control-Allow-Headers"]).toContain("X-Codeedge-Chat-Session");
    expect(websiteChatCorsHeaders["Cache-Control"]).toBe("no-store");
  });

  it("renders a Codeedge-native dependency-free embed loader", () => {
    const script = renderWebsiteChatEmbedScript();
    expect(script).toContain("data-widget-id");
    expect(script).toContain("X-Codeedge-Chat-Session");
    expect(script).toContain("localStorage");
    expect(script).toContain("Website Chat");
    expect(script).not.toMatch(/tiledesk/i);
    expect(script).not.toMatch(/firebase/i);
  });
});
