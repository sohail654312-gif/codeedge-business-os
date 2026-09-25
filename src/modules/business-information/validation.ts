import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);

const websiteSchema = text(2048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !/\s/.test(value);
  } catch {
    return false;
  }
}, "Use an HTTPS website address without credentials.");

export const businessProfileSchema = z.object({
  trading_name: text(120),
  phone: text(40).regex(/^[+0-9().\s-]*$/, "Use a valid phone number."),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  website: websiteSchema,
  address: text(500),
  description: text(3000),
  category: text(120),
  logo_alt: text(120),
});

const priceSchema = z.string().trim()
  .regex(/^(?:|[0-9]{1,7}(?:\.[0-9]{1,2})?)$/, "Use a non-negative GBP amount with at most two decimal places.")
  .transform((value) => value === "" ? null : Math.round(Number(value) * 100))
  .refine((value) => value === null || value <= 100000000, "Maximum starting price is £1,000,000.");

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Service name must contain at least 2 characters.").max(120),
  description: text(3000),
  active: z.boolean(),
  quote_required: z.boolean(),
  duration_minutes: z.preprocess(
    (value) => value == null || value === "" ? "30" : value,
    z.string().trim()
      .regex(/^[0-9]{1,3}$/, "Duration must be a whole number of minutes.")
      .transform(Number)
      .pipe(z.number().int().min(5).max(480)),
  ),
  starting_price_gbp: priceSchema,
  display_order: z.string().trim().regex(/^[0-9]{1,5}$/, "Display order must be a whole number.")
    .transform(Number)
    .pipe(z.number().int().min(0).max(10000)),
});

export const serviceIdSchema = z.string().uuid();
