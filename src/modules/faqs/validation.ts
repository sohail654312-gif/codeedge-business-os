import { z } from "zod";

export const faqSchema = z.object({
  question: z.string().trim().min(1, "Question is required.").max(300),
  answer: z.string().trim().min(1, "Answer is required.").max(5000),
  is_active: z.boolean(),
  display_order: z.string()
    .trim()
    .regex(/^[0-9]{1,5}$/, "Display order must be a whole number.")
    .transform(Number)
    .pipe(z.number().int().min(0).max(10000)),
});

export const faqIdSchema = z.string().uuid();
