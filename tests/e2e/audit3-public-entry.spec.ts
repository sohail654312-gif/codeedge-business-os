import { expect, test } from "@playwright/test";

test("public workspace calls to action do not send unauthenticated visitors to a protected dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Create workspace", exact: true }))
    .toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Create your workspace", exact: true }))
    .toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Sign in", exact: true }).first())
    .toHaveAttribute("href", "/login");
});
