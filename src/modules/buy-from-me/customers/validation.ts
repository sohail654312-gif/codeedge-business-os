import { z } from "zod";

const optionalEmail = z.string().trim().max(254).refine(
  (value) => value === "" || z.email().safeParse(value).success,
  "Enter a valid email address.",
);
const fields = {
  contact_name: z.string().trim().min(1, "Contact name is required.").max(120),
  phone: z.string().trim().max(40),
  email: optionalEmail,
};
const hasContact = <T extends { phone: string; email: string }>(value: T) =>
  value.phone.length > 0 || value.email.length > 0;

export const customerCreateSchema = z.object(fields).refine(hasContact, {
  message: "Add a phone number or email address.",
});
export const customerEditSchema = z.object({
  customer_id: z.uuid(),
  ...fields,
}).refine(hasContact, {
  message: "Add a phone number or email address.",
});

const first = (value: unknown) => Array.isArray(value) ? value[0] : value;
export const customerFilterSchema = z.object({
  q: z.preprocess(first, z.string().trim().max(120).catch(""))
    .transform((value) => value || null),
  source: z.preprocess(
    first,
    z.union([z.literal(""), z.literal("lead"), z.literal("direct")]).catch(""),
  ).transform((value) => value || null),
});
export type CustomerFilters = z.infer<typeof customerFilterSchema>;
