import { z } from "zod";

// Syntax-only UK coverage hint: outward code or full postcode.
// This is not address verification.
export const postcodeSchema = z.string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/\s+/g, ""))
  .refine(
    (value) =>
      value === "" ||
      /^(?:GIR0AA|[A-PR-UWYZ][A-HK-Y]?[0-9][0-9A-HJKPSTUW]?(?:[0-9][ABD-HJLNP-UW-Z]{2})?)$/.test(value),
    "Use a UK postcode or outward code, such as SW1A or SW1A 1AA.",
  )
  .transform((value) => {
    if (/\d[ABD-HJLNP-UW-Z]{2}$/.test(value)) {
      return value.slice(0, -3) + " " + value.slice(-3);
    }
    return value;
  });

export const serviceAreaSchema = z.object({
  name: z.string().trim().min(2, "Area name must contain at least 2 characters.").max(120),
  postcode: postcodeSchema,
  notes: z.string().trim().max(1000),
  active: z.boolean(),
  display_order: z.string()
    .trim()
    .regex(/^[0-9]{1,5}$/, "Display order must be a whole number.")
    .transform(Number)
    .pipe(z.number().int().min(0).max(10000)),
});

export const serviceAreaIdSchema = z.string().uuid();
export const weekdaySchema = z.string().regex(/^[1-7]$/).transform(Number);

const timeSchema = z.string().regex(
  /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/,
  "Use a time in HH:MM format.",
);

export const openingHoursSchema = z.discriminatedUnion("is_closed", [
  z.object({
    is_closed: z.literal(true),
    opens_at: z.unknown().transform(() => null),
    closes_at: z.unknown().transform(() => null),
  }),
  z.object({
    is_closed: z.literal(false),
    opens_at: timeSchema,
    closes_at: timeSchema,
  }).refine(
    (value) => value.opens_at < value.closes_at,
    "Closing time must be later than opening time on the same day.",
  ),
]);

export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
