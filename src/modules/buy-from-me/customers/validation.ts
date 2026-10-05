import { z } from "zod";

export const customerFormSchema = z.object({
  customer_id: z.uuid(),
  contact_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(254).refine(value => !value || z.email().safeParse(value).success),
}).refine(value => Boolean(value.phone || value.email), "Add a phone number or email address.");
