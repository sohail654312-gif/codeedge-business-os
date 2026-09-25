"use client";

import { useActionState } from "react";
import {
  createMoneyBill,
  createMoneyExpense,
  createMoneyInvoice,
  createMoneyQuote,
  createMoneySupplier,
  recordMoneyPayment,
  type MoneyActionState,
} from "@/modules/money/actions";

const initialState: MoneyActionState = {};

function Notice({ state }: { state: MoneyActionState }) {
  return (
    <>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
    </>
  );
}

function Unsupported({ message }: { message: string }) {
  return (
    <section className="panel">
      <h2>Standard Money writes</h2>
      <p className="muted">{message}</p>
    </section>
  );
}

export function MoneySalesWriteForms({
  customers,
  quotes,
  invoices,
  currency,
  writeEnabled,
  writeMessage,
}: {
  customers: Array<{ id: string; name: string }>;
  quotes: Array<{ id: string; label: string }>;
  invoices: Array<{ id: string; label: string }>;
  currency: string;
  writeEnabled: boolean;
  writeMessage: string;
}) {
  const [quoteState, quoteAction, quotePending] = useActionState(createMoneyQuote, initialState);
  const [invoiceState, invoiceAction, invoicePending] = useActionState(createMoneyInvoice, initialState);
  const [paymentState, paymentAction, paymentPending] = useActionState(recordMoneyPayment, initialState);

  if (!writeEnabled) return <Unsupported message={writeMessage} />;

  return (
    <section className="panel">
      <div className="settingsSectionHead">
        <div><h2>Create sales records</h2><p className="muted">Normal V1 write UX through the Codeedge Finance service.</p></div>
        <span className="pill">{currency}</span>
      </div>

      {customers.length === 0 ? (
        <p className="muted">Convert a Lead to a CRM Customer before creating quotes or invoices.</p>
      ) : (
        <div className="profileGrid">
          <details className="businessServiceCard">
            <summary>Create quote</summary>
            <form action={quoteAction} className="businessInfoForm">
              <div className="field"><label>Customer</label><select name="customer_id" required>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
              <div className="field"><label>Amount ({currency})</label><input name="amount" inputMode="decimal" required placeholder="850.00" /></div>
              <div className="field"><label>Valid until</label><input name="valid_until" type="date" /></div>
              <Notice state={quoteState} />
              <button className="btn primary" type="submit" disabled={quotePending}>{quotePending ? "Creating..." : "Create quote"}</button>
            </form>
          </details>

          <details className="businessServiceCard">
            <summary>Create invoice</summary>
            <form action={invoiceAction} className="businessInfoForm">
              <div className="field"><label>Customer</label><select name="customer_id" required>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
              <div className="field"><label>Quote (optional)</label><select name="quote_id" defaultValue=""><option value="">No linked quote</option>{quotes.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
              <div className="field"><label>Amount ({currency})</label><input name="amount" inputMode="decimal" required placeholder="850.00" /></div>
              <div className="field"><label>Due date</label><input name="due_at" type="date" /></div>
              <Notice state={invoiceState} />
              <button className="btn primary" type="submit" disabled={invoicePending}>{invoicePending ? "Creating..." : "Create invoice"}</button>
            </form>
          </details>
        </div>
      )}

      <details className="businessServiceCard topGap">
        <summary>Record accounting payment</summary>
        {invoices.length === 0 ? <p className="muted">Create an invoice before recording a payment.</p> : (
          <form action={paymentAction} className="businessInfoForm">
            <div className="field"><label>Invoice</label><select name="invoice_id" required>{invoices.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
            <div className="field"><label>Amount ({currency})</label><input name="amount" inputMode="decimal" required placeholder="500.00" /></div>
            <Notice state={paymentState} />
            <button className="btn primary" type="submit" disabled={paymentPending}>{paymentPending ? "Recording..." : "Record payment"}</button>
          </form>
        )}
      </details>
    </section>
  );
}

export function MoneyPurchaseWriteForms({
  suppliers,
  currency,
  writeEnabled,
  writeMessage,
}: {
  suppliers: Array<{ id: string; name: string }>;
  currency: string;
  writeEnabled: boolean;
  writeMessage: string;
}) {
  const [supplierState, supplierAction, supplierPending] = useActionState(createMoneySupplier, initialState);
  const [billState, billAction, billPending] = useActionState(createMoneyBill, initialState);
  const [expenseState, expenseAction, expensePending] = useActionState(createMoneyExpense, initialState);

  if (!writeEnabled) return <Unsupported message={writeMessage} />;

  return (
    <section className="panel">
      <div className="settingsSectionHead">
        <div><h2>Create purchase records</h2><p className="muted">Supplier, bill and expense writes use the active Codeedge Finance service.</p></div>
        <span className="pill">{currency}</span>
      </div>
      <div className="profileGrid">
        <details className="businessServiceCard">
          <summary>Create supplier</summary>
          <form action={supplierAction} className="businessInfoForm">
            <div className="field"><label>Name</label><input name="name" required maxLength={200} /></div>
            <div className="field"><label>Email</label><input name="email" type="email" maxLength={320} /></div>
            <div className="field"><label>Phone</label><input name="phone" maxLength={80} /></div>
            <Notice state={supplierState} />
            <button className="btn primary" type="submit" disabled={supplierPending}>{supplierPending ? "Creating..." : "Create supplier"}</button>
          </form>
        </details>

        <details className="businessServiceCard">
          <summary>Create bill</summary>
          {suppliers.length === 0 ? <p className="muted">Create a supplier first.</p> : (
            <form action={billAction} className="businessInfoForm">
              <div className="field"><label>Supplier</label><select name="supplier_id" required>{suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
              <div className="field"><label>Amount ({currency})</label><input name="amount" inputMode="decimal" required placeholder="120.00" /></div>
              <div className="field"><label>Due date</label><input name="due_at" type="date" /></div>
              <Notice state={billState} />
              <button className="btn primary" type="submit" disabled={billPending}>{billPending ? "Creating..." : "Create bill"}</button>
            </form>
          )}
        </details>
      </div>

      <details className="businessServiceCard topGap">
        <summary>Create expense</summary>
        <form action={expenseAction} className="businessInfoForm">
          <div className="field"><label>Supplier (optional)</label><select name="supplier_id" defaultValue=""><option value="">No supplier</option>{suppliers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
          <div className="field"><label>Category</label><input name="category" required maxLength={120} placeholder="Clinic supplies" /></div>
          <div className="field"><label>Amount ({currency})</label><input name="amount" inputMode="decimal" required placeholder="45.00" /></div>
          <div className="field"><label>Incurred date</label><input name="incurred_at" type="date" required /></div>
          <Notice state={expenseState} />
          <button className="btn primary" type="submit" disabled={expensePending}>{expensePending ? "Creating..." : "Create expense"}</button>
        </form>
      </details>
    </section>
  );
}
