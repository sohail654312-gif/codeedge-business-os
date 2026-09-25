import { expect, test } from "@playwright/test";

test("Demo AI Accountant grounds answers and executes an approved invoice exactly once", async ({ browser }) => {
  const ownerA=await browser.newContext();
  const ownerB=await browser.newContext();

  try {
    const pageA=await ownerA.newPage();
    await pageA.goto("/__e2e/ai-accountant");

    await expect(pageA.getByRole("heading",{ name:"AI Accountant",level:1 })).toBeVisible();
    await expect(pageA.getByTestId("finance-document-count"))
      .toHaveText("Finance documents: 0");

    await pageA.getByLabel("Finance question").fill("Give me a finance summary.");
    await pageA.getByRole("button",{ name:"Ask AI Accountant" }).click();

    await expect(pageA.getByText(
      /Based on the Codeedge Money Dashboard.*receivables are GBP 350\.00/
    )).toBeVisible();
    await expect(pageA.getByRole("heading",{ name:"Finance evidence used" })).toBeVisible();
    await expect(pageA.getByText("Money Dashboard",{ exact:true })).toBeVisible();
    await expect(pageA.getByTestId("finance-document-count"))
      .toHaveText("Finance documents: 0");

    await pageA.getByLabel("Finance question")
      .fill("Create an invoice for Demo Patient Customer for 500 due 2026-10-15.");
    await pageA.getByRole("button",{ name:"Ask AI Accountant" }).click();

    const proposalA=pageA.locator(".aiProposalCard").filter({ hasText:"Create Invoice" });
    await expect(proposalA).toBeVisible();
    await expect(proposalA.getByText("Human approval required")).toBeVisible();
    await expect(proposalA.getByText("500.00",{ exact:true })).toBeVisible();
    await expect(proposalA.getByText("demo_finance",{ exact:true })).toBeVisible();
    await expect(proposalA.getByText("demo",{ exact:true })).toBeVisible();
    await expect(pageA.getByTestId("finance-document-count"))
      .toHaveText("Finance documents: 0");

    const pageB=await ownerB.newPage();
    await pageB.goto("/__e2e/ai-accountant");
    const staleProposal=pageB.locator(".aiProposalCard").filter({ hasText:"Create Invoice" });
    await expect(staleProposal.getByRole("button",{ name:"Approve" })).toBeVisible();

    await proposalA.getByRole("button",{ name:"Approve" }).click();
    await expect(proposalA.getByText(
      "Approved and executed through Codeedge Finance: demo:e2e-invoice-1"
    )).toBeVisible();

    await staleProposal.getByRole("button",{ name:"Approve" }).click();
    await expect(staleProposal.getByText(
      "That proposal has already been executed. Codeedge will not run it twice."
    )).toBeVisible();

    await pageA.reload();
    await expect(pageA.getByTestId("finance-document-count"))
      .toHaveText("Finance documents: 1");

    const completed=pageA.locator(".aiProposalCard").filter({ hasText:"Create Invoice" });
    await expect(completed.getByText("succeeded",{ exact:true })).toBeVisible();
    await expect(completed.getByRole("button",{ name:"Approve" })).toHaveCount(0);

    await pageA.reload();
    await expect(pageA.getByTestId("finance-document-count"))
      .toHaveText("Finance documents: 1");
  } finally {
    await ownerA.close();
    await ownerB.close();
  }
});
