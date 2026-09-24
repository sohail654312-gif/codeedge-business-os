import type { LeadSource } from "./domain";

export type LeadCreateValues = {
  contact_name: string;
  phone: string;
  email: string;
  source: LeadSource;
  service_id: string | null;
  enquiry_summary: string;
  estimated_value_pence: number | null;
};

export function buildLeadInsert(
  values: LeadCreateValues,
  context: { businessId: string; userId: string },
) {
  return {
    business_id: context.businessId,
    contact_name: values.contact_name,
    phone: values.phone,
    email: values.email,
    source: values.source,
    service_id: values.service_id,
    enquiry_summary: values.enquiry_summary,
    status: "new" as const,
    estimated_value_pence: values.estimated_value_pence,
    last_contact_at: null,
    created_by: context.userId,
  };
}

export function buildLeadUpdate(values: LeadCreateValues) {
  return {
    contact_name: values.contact_name,
    phone: values.phone,
    email: values.email,
    source: values.source,
    service_id: values.service_id,
    enquiry_summary: values.enquiry_summary,
    estimated_value_pence: values.estimated_value_pence,
  };
}
