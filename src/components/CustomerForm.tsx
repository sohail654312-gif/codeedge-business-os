"use client";
import { useActionState } from "react";
import { createCustomer,updateCustomer,type CustomerFormState } from "@/modules/buy-from-me/customers/actions";
export function CustomerForm({ id,customer }: { id:string; customer?: { contact_name:string; phone:string; email:string } }) {
  const [state,action,pending] = useActionState(customer ? updateCustomer : createCustomer,{} as CustomerFormState);
  return <form action={action} className="panel">
    <input type="hidden" name="customer_id" value={id} />
    <label htmlFor="contact_name">Customer name</label><input id="contact_name" name="contact_name" required maxLength={120} defaultValue={customer?.contact_name} />
    <label htmlFor="phone">Phone</label><input id="phone" name="phone" maxLength={40} defaultValue={customer?.phone} />
    <label htmlFor="email">Email</label><input id="email" name="email" type="email" maxLength={254} defaultValue={customer?.email} />
    <p className="muted">Provide at least one contact method. Finance mappings remain attached to this Customer identity.</p>
    {state.error ? <p role="alert">{state.error}</p> : null}
    <button className="btn primary" disabled={pending}>{pending ? "Saving…" : "Save Customer"}</button>
  </form>;
}
