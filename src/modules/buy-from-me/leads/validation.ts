import { z } from "zod";
import { leadSources, leadStatuses, quoteRequestStatuses } from "./domain";

const optionalEmail = z.string().trim().max(254).refine(
  (value) => value === "" || z.email().safeParse(value).success,
  "Enter a valid email address.",
);

const optionalServiceId = z.union([z.literal(""), z.uuid(), z.null()]).transform((value) => value || null);

const optionalEstimatedValuePence = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.union([
    z.null(),
    z.coerce.number().int().min(0).max(1_000_000_000),
  ]),
);

const optionalLastContactAt = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.union([z.null(), z.string().datetime({ offset: true })]),
);

export const leadInputSchema = z.object({
  contact_name: z.string().trim().min(1, "Contact name is required.").max(120),
  phone: z.string().trim().max(40),
  email: optionalEmail,
  source: z.enum(leadSources),
  service_id: optionalServiceId,
  enquiry_summary: z.string().trim().min(1, "Enquiry summary is required.").max(3000),
  status: z.enum(leadStatuses),
  estimated_value_pence: optionalEstimatedValuePence.default(null),
  last_contact_at: optionalLastContactAt.default(null),
}).refine(
  (value) => value.phone.length > 0 || value.email.length > 0,
  { message: "Add a phone number or email address." },
);

export const leadNoteInputSchema = z.object({
  body: z.string().trim().min(1, "Note is required.").max(5000),
});

export const quoteRequestInputSchema = z.object({
  details: z.string().trim().min(1, "Quote request details are required.").max(5000),
  status: z.enum(quoteRequestStatuses),
});

export type LeadInput = z.infer<typeof leadInputSchema>;
export type LeadNoteInput = z.infer<typeof leadNoteInputSchema>;
export type QuoteRequestInput = z.infer<typeof quoteRequestInputSchema>;
