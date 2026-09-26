import { expect, test } from "@playwright/test";

test("critical V1 wiring stays tenant-isolated and external-effect safe", async ({ page }) => {
  await page.goto("/e2e-harness/business-os");

  await page.getByRole("button", { name: "Sign in as owner" }).click();
  await expect(page.getByTestId("signed-in-user")).toContainText("owner:");
  await expect(page.getByTestId("workspace")).toContainText(
    "20000000-0000-4000-8000-00000000e601",
  );

  await page.getByRole("button", { name: "Attempt other workspace" }).click();
  await expect(page.getByTestId("security-result")).toHaveText("denied");
  await expect(page.getByTestId("other-business-leads")).toHaveText("0");

  await page.getByRole("button", { name: "Create Lead" }).click();
  await expect(page.getByTestId("lead-count")).toHaveText("1");
  await page.getByRole("button", { name: "Convert Lead to Customer" }).click();
  await expect(page.getByTestId("customer-count")).toHaveText("1");

  await page.getByRole("button", { name: "Create Booking" }).click();
  await expect(page.getByTestId("booking-count")).toHaveText("1");

  await page.getByRole("button", { name: "Send Demo Communication" }).click();
  await expect(page.getByTestId("communication-count")).toHaveText("1");

  await page.getByRole("button", { name: "Run Automation Demo Dry-Run" }).click();
  await expect(page.getByTestId("automation-count")).toHaveText("1");
  await expect(page.getByTestId("automation-status")).toHaveText("simulated");

  await page.getByRole("button", { name: "Run Demo Receptionist" }).click();
  await expect(page.getByTestId("voice-count")).toHaveText("1");
  await expect(page.getByTestId("voice-provider-id")).toContainText("demo:");
  await expect(page.getByTestId("booking-count")).toHaveText("2");

  await page.getByRole("button", { name: "Run Demo Money Journey" }).click();
  await expect(page.getByTestId("money-documents")).toHaveText("3");
  await expect(page.getByTestId("receivables")).toHaveText("350.00");

  await expect(page.getByTestId("external-provider-effects")).toHaveText("0");
});
