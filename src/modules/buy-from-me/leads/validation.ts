import { z } from "zod";
import { leadSources, leadStatuses, quoteRequestStatuses } from "./domain";

const optionalEmail = z.string().trim().max(254).refine(
  (value) => value === "" || z.email().safeParse(value).success,
  "Enter a valid email address.",
);

const optionalServiceId = z.union([z.literal(""), z.uuid(), z.null()]).transform((value) => value || null);

const optionalEstimatedValuePence = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.union([z.null(), z.coerce.number().int().min(0).max(1_000_000_000)]),
);

const optionalLastContactAt = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.union([z.null(), z.string().datetime({ offset: true })]),
);

const contactFields = {
  contact_name: z.string().trim().min(1, "Contact name is required.").max(120),
  phone: z.string().trim().max(40),
  email: optionalEmail,
  source: z.enum(leadSources),
  service_id: optionalServiceId,
  enquiry_summary: z.string().trim().min(1, "Enquiry summary is required.").max(3000),
};

const estimatedValueGbp = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.union([z.null(), z.coerce.number().min(0).max(10_000_000)]),
);

const hasContactMethod = <T extends { phone: string; email: string }>(value: T) =>
  value.phone.length > 0 || value.email.length > 0;

function normalizeLeadForm(value: {
  contact_name: string;
  phone: string;
  email: string;
  source: (typeof leadSources)[number];
  service_id: string | null;
  enquiry_summary: string;
  estimated_value_gbp: number | null;
}) {
  return {
    contact_name: value.contact_name,
    phone: value.phone,
    email: value.email,
    source: value.source,
    service_id: value.service_id,
    enquiry_summary: value.enquiry_summary,
    estimated_value_pence: value.estimated_value_gbp === null
      ? null
      : Math.round(value.estimated_value_gbp * 100),
  };
}

export const leadInputSchema = z.object({
  ...contactFields,
  status: z.enum(leadStatuses),
  estimated_value_pence: optionalEstimatedValuePence.default(null),
  last_contact_at: optionalLastContactAt.default(null),
}).refine(hasContactMethod, {
  message: "Add a phone number or email address.",
});

export const leadCreateFormSchema = z.object({
  ...contactFields,
  estimated_value_gbp: estimatedValueGbp,
}).refine(hasContactMethod, {
  message: "Add a phone number or email address.",
}).transform(normalizeLeadForm);

export const leadEditFormSchema = z.object({
  lead_id: z.uuid(),
  ...contactFields,
  estimated_value_gbp: estimatedValueGbp,
}).refine(hasContactMethod, {
  message: "Add a phone number or email address.",
}).transform((value) => ({
  lead_id: value.lead_id,
  ...normalizeLeadForm(value),
}));

export const leadStatusFormSchema = z.object({
  lead_id: z.uuid(),
  status: z.enum(leadStatuses),
});

export const leadNoteInputSchema = z.object({
  body: z.string().trim().min(1, "Note is required.").max(5000),
});

export const quoteRequestInputSchema = z.object({
  details: z.string().trim().min(1, "Quote request details are required.").max(5000),
  status: z.enum(quoteRequestStatuses),
});

export type LeadInput = z.infer<typeof leadInputSchema>;
export type LeadCreateInput = z.infer<typeof leadCreateFormSchema>;
export type LeadEditInput = z.infer<typeof leadEditFormSchema>;
export type LeadStatusInput = z.infer<typeof leadStatusFormSchema>;
export type LeadNoteInput = z.infer<typeof leadNoteInputSchema>;
export type QuoteRequestInput = z.infer<typeof quoteRequestInputSchema>;
