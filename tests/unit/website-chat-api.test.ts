import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const chat = vi.hoisted(() => ({
  start: vi.fn(),
  history: vi.fn(),
  send: vi.fn(),
  contact: vi.fn(),
}));

vi.mock("@/server/website-chat/service", () => ({
  startWebsiteChat: chat.start,
  getWebsiteChatHistory: chat.history,
  sendWebsiteChatMessage: chat.send,
  captureWebsiteChatLead: chat.contact,
}));

import { OPTIONS, POST } from "@/app/api/website-chat/[widgetId]/route";

const widgetId = "71000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
const requestId = "72000000-0000-4000-8000-000000000001";

function request(body: object, sessionToken?: string) {
  return new NextRequest(`http://localhost/api/website-chat/${widgetId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { "X-Codeedge-Chat-Session": sessionToken } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  chat.start.mockResolvedValue({
    config: {
      available: true,
      widgetName: "Support",
      launcherLabel: "Chat",
      greetingText: "Hello",
      welcomeMessage: "Welcome",
      offlineMessage: "Offline",
      leadCaptureEnabled: true,
      accentColor: "#23BDF0",
    },
    messages: [],
    contactSaved: false,
    status: null,
  });
  chat.history.mockResolvedValue({ messages: [], contactSaved: false, status: "open" });
  chat.send.mockResolvedValue({ messages: [], contactSaved: false, status: "open" });
  chat.contact.mockResolvedValue({ messages: [], contactSaved: true, status: "open" });
});

describe("Website Chat public API boundary", () => {
  it("supports CORS preflight without credentials", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("creates a session token on start and never accepts browser tenant selectors", async () => {
    const response = await POST(request({ action: "start" }), {
      params: Promise.resolve({ widgetId }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sessionToken).toMatch(/^[a-f0-9]{64}$/);
    expect(chat.start).toHaveBeenCalledWith(widgetId, body.sessionToken);

    const forged = await POST(request({ action: "start", business_id: widgetId }), {
      params: Promise.resolve({ widgetId }),
    });
    expect(forged.status).toBe(400);
    expect(chat.start).toHaveBeenCalledTimes(1);
  });

  it("requires an existing valid visitor token for non-start operations", async () => {
    const response = await POST(request({ action: "history" }), {
      params: Promise.resolve({ widgetId }),
    });
    expect(response.status).toBe(401);
    expect(chat.history).not.toHaveBeenCalled();
  });

  it("forwards only validated send data plus server-resolved session token", async () => {
    const response = await POST(request({
      action: "send",
      requestId,
      body: "Hello",
      conversation_id: widgetId,
    }, token), {
      params: Promise.resolve({ widgetId }),
    });

    expect(response.status).toBe(400);
    expect(chat.send).not.toHaveBeenCalled();

    const valid = await POST(request({
      action: "send",
      requestId,
      body: "Hello",
    }, token), {
      params: Promise.resolve({ widgetId }),
    });

    expect(valid.status).toBe(200);
    expect(chat.send).toHaveBeenCalledWith(widgetId, token, requestId, "Hello");
  });

  it("hides internal errors and secrets", async () => {
    chat.history.mockRejectedValue(new Error("postgres tenant password=secret"));
    const response = await POST(request({ action: "history" }, token), {
      params: Promise.resolve({ widgetId }),
    });

    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).not.toMatch(/postgres|password|tenant|secret/i);
  });
});
