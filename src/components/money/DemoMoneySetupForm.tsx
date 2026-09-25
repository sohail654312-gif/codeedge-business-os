"use client";

import { useActionState } from "react";
import {
  configureDemoMoney,
  seedDemoMoneyJourney,
  type MoneyActionState,
} from "@/modules/money/actions";

const initial: MoneyActionState = {};

export function DemoMoneySetupForm({
  configured,
  currency,
  owner,
}: {
  configured: boolean;
  currency: string;
  owner: boolean;
}) {
  const [setupState,setupAction,setupPending] = useActionState(configureDemoMoney,initial);
  const [seedState,seedAction,seedPending] = useActionState(seedDemoMoneyJourney,initial);

  return (
    <div className="twoCol">
      <form className="panel" action={setupAction}>
        <h2>Demo Finance Engine</h2>
        <p className="muted">
          Internal simulated finance only. No ERPNext, banking or payment provider traffic.
        </p>
        <div className="field">
          <label htmlFor="money-currency">Demo currency</label>
          <select
            id="money-currency"
            name="currency"
            defaultValue={currency || "GBP"}
            disabled={!owner || setupPending}
          >
            <option value="GBP">GBP — British pound</option>
            <option value="PKR">PKR — Pakistani rupee</option>
            <option value="USD">USD — US dollar</option>
            <option value="EUR">EUR — Euro</option>
          </select>
        </div>
        {setupState.error ? <p className="errorText">{setupState.error}</p> : null}
        {setupState.success ? <p>{setupState.success}</p> : null}
        {owner ? (
          <button className="btn" disabled={setupPending}>
            {setupPending ? "Saving…" : configured ? "Update Demo Finance" : "Configure Demo Finance"}
          </button>
        ) : <p className="muted">Only the owner can change Finance configuration.</p>}
      </form>

      <form className="panel" action={seedAction}>
        <h2>Demo Money journey</h2>
        <p className="muted">
          Uses the first canonical CRM Customer and deterministic request IDs to create a Quote,
          Invoice, simulated Payment, Supplier, Bill and Expense.
        </p>
        {seedState.error ? <p className="errorText">{seedState.error}</p> : null}
        {seedState.success ? <p>{seedState.success}</p> : null}
        {owner ? (
          <button className="btn" disabled={!configured || seedPending}>
            {seedPending ? "Preparing…" : "Seed Demo Money journey"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
