import { expect, test, type BrowserContext } from "@playwright/test";

const widgetId = "71000000-0000-4000-8000-000000000001";

type PublicMessage = {
  sender: "visitor" | "team";
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
};

async function installChatTransport(context: BrowserContext, token: string) {
  const messages: PublicMessage[] = [];
  let contactSaved = false;
  let staffReplyQueued = false;

  await context.route("**/api/website-chat/*", async (route) => {
    const request = route.request();
    const input = request.postDataJSON() as {
      action: "start" | "history" | "status" | "send" | "contact";
      body?: string;
    };
    const session = request.headers()["x-codeedge-chat-session"];

    if (input.action !== "start" && session !== token) {
      await route.fulfill({ status: 401, json: { error: "Chat session unavailable." } });
      return;
    }

    if (input.action === "start") {
      await route.fulfill({
        json: {
          config: {
            available: true,
            widgetName: "Northfield Support",
            launcherLabel: "Chat with us",
            greetingText: "Team online",
            welcomeMessage: "Welcome to Northfield Support.",
            offlineMessage: "We are currently unavailable.",
            leadCaptureEnabled: true,
            accentColor: "#23BDF0",
          },
          messages,
          contactSaved,
          status: "open",
          sessionToken: token,
        },
      });
      return;
    }

    if (input.action === "send") {
      messages.push({
        sender: "visitor",
        direction: "inbound",
        body: input.body ?? "",
        created_at: new Date().toISOString(),
      });
      staffReplyQueued = true;
      await route.fulfill({ json: { messages, contactSaved, status: "open" } });
      return;
    }

    if (input.action === "contact") {
      contactSaved = true;
      await route.fulfill({ json: { messages, contactSaved, status: "open" } });
      return;
    }

    if (staffReplyQueued) {
      staffReplyQueued = false;
      messages.push({
        sender: "team",
        direction: "outbound",
        body: "A Codeedge team member replied from the Shared Inbox.",
        created_at: new Date().toISOString(),
      });
    }

    await route.fulfill({ json: { messages, contactSaved, status: "open" } });
  });

  return { messages };
}

test("embedded Website Chat persists a secure visitor session and receives staff replies", async ({ browser }) => {
  const visitorA = await browser.newContext();
  const transportA = await installChatTransport(visitorA, "a".repeat(64));

  try {
    const page = await visitorA.newPage();
    await page.goto(`/chat/${widgetId}`);

    await expect(page.getByRole("heading", { name: "Widget preview" })).toBeVisible();
    await page.getByRole("button", { name: "Chat with us" }).click();

    await expect(page.getByRole("dialog", { name: "Website chat" })).toBeVisible();
    await expect(page.getByText("Welcome to Northfield Support.")).toBeVisible();

    await page.getByLabel("Your message").fill("My boiler is not working.");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("My boiler is not working.")).toBeVisible();
    await expect(page.getByText("A Codeedge team member replied from the Shared Inbox.")).toBeVisible({
      timeout: 6_000,
    });

    await page.getByText("Leave your contact details").click();
    await page.getByPlaceholder("Your name").fill("Fictional Visitor");
    await page.getByPlaceholder("Phone").fill("07123456789");
    await page.getByRole("button", { name: "Save contact" }).click();
    await expect(page.getByText("Contact details saved.")).toBeVisible();

    const storedToken = await page.evaluate((key) => localStorage.getItem(key), `codeedge_chat_${widgetId}`);
    expect(storedToken).toBe("a".repeat(64));

    await page.reload();
    await page.getByRole("button", { name: "Chat with us" }).click();
    await expect(page.getByText("My boiler is not working.")).toBeVisible();
    await expect(page.getByText("A Codeedge team member replied from the Shared Inbox.")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    expect(transportA.messages.map((message) => message.body)).toEqual([
      "My boiler is not working.",
      "A Codeedge team member replied from the Shared Inbox.",
    ]);
  } finally {
    await visitorA.close();
  }

  const visitorB = await browser.newContext();
  await installChatTransport(visitorB, "b".repeat(64));

  try {
    const pageB = await visitorB.newPage();
    await pageB.goto(`/chat/${widgetId}`);
    await pageB.getByRole("button", { name: "Chat with us" }).click();

    await expect(pageB.getByText("My boiler is not working.")).toHaveCount(0);
    expect(await pageB.evaluate((key) => localStorage.getItem(key), `codeedge_chat_${widgetId}`)).toBe("b".repeat(64));
  } finally {
    await visitorB.close();
  }
});
