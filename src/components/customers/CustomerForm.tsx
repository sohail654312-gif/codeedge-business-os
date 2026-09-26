"use client";

import { useActionState } from "react";
import {
  createCustomer,
  updateCustomer,
  type CustomerFormState,
} from "@/modules/buy-from-me/customers/actions";

const initialState: CustomerFormState = {};

export function CustomerForm({
  customer,
}: {
  customer?: { id: string; contact_name: string; phone: string; email: string };
}) {
  const [state, formAction, pending] = useActionState(
    customer ? updateCustomer : createCustomer,
    initialState,
  );

  return (
    <form action={formAction} className="panel businessInfoForm">
      {customer ? <input type="hidden" name="customer_id" value={customer.id} /> : null}
      <div className="field">
        <label htmlFor="customer-name">Contact name</label>
        <input id="customer-name" name="contact_name" required maxLength={120}
          defaultValue={customer?.contact_name ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="customer-phone">Phone</label>
        <input id="customer-phone" name="phone" maxLength={40}
          defaultValue={customer?.phone ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="customer-email">Email</label>
        <input id="customer-email" name="email" type="email" maxLength={254}
          defaultValue={customer?.email ?? ""} />
      </div>
      <p className="muted">
        A Customer needs at least one contact method. Direct Customers stay in
        the canonical Codeedge CRM and can later be used by Booking and Money.
      </p>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving..." : customer ? "Save customer" : "Create customer"}
      </button>
    </form>
  );
}
