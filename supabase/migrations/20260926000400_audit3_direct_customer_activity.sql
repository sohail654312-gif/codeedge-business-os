-- Audit 3 functional remediation: direct Customers are not Lead-conversion events.
-- Keep the existing customer activity trigger, but only append conversion history
-- when the Customer was actually created from a Lead.

create or replace function private.crm_activity_from_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_lead_id is not null then
    perform private.append_crm_activity(
      new.business_id,
      new.source_lead_id,
      'lead_converted_to_customer',
      'Lead converted to Customer',
      jsonb_build_object('customer_id', new.id)
    );
  end if;

  return new;
end;
$$;

revoke all on function private.crm_activity_from_customer()
from public, anon, authenticated;
