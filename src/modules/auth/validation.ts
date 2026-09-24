import { z } from "zod";

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(12, "Use at least 12 characters.").max(256);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const signupSchema = z.object({
  business_name: z.string().trim().min(2, "Business name is required.").max(120),
  email: emailSchema,
  password: passwordSchema,
  confirmation: z.string().min(1).max(256),
}).refine((value) => value.password === value.confirmation, {
  message: "Passwords do not match.",
  path: ["confirmation"],
});
