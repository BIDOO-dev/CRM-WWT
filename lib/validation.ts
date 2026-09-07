import { z } from "zod";

const nullableText = z.string().trim().optional().or(z.literal(""));
const phone = z.string().trim().min(7, "Enter a valid phone number.").max(40);

export const loginSchema = z.object({
  email: z.email("Enter a valid work email.").trim(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const leadStatusSchema = z.enum(["new", "contacted", "qualified", "site_visit", "quotation", "negotiation", "won", "lost"]);

export const leadSchema = z.object({
  contact_id: nullableText,
  full_name: nullableText,
  phone,
  whatsapp_number: nullableText,
  contact_email: z.union([z.email("Enter a valid email."), z.literal("")]),
  organization_name: nullableText,
  source: z.enum(["manual", "whatsapp", "meta_ad", "website", "phone", "email", "referral", "outbound", "tender", "social_media", "other"]),
  receiving_whatsapp_number: nullableText,
  campaign_source: nullableText,
  customer_need: z.string().trim().min(2, "Describe what the customer needs.").max(240),
  location_text: nullableText,
  status: leadStatusSchema,
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assigned_to: z.uuid("Choose a salesperson."),
  received_at: z.string().min(1, "Date received is required."),
  last_contacted_at: nullableText,
  next_follow_up_at: nullableText,
  notes: nullableText,
  original_message: nullableText,
});

export const contactSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required.").max(160),
  phone,
  whatsapp_number: nullableText,
  email: z.union([z.email("Enter a valid email."), z.literal("")]),
  location_text: nullableText,
  organization_name: nullableText,
  notes: nullableText,
  owner_id: z.uuid("Choose an owner."),
});

export const taskSchema = z.object({
  title: z.string().trim().min(2, "Task title is required.").max(180),
  description: nullableText,
  task_type: z.enum(["call", "whatsapp", "email", "meeting", "site_visit", "follow_up", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  due_at: z.string().min(1, "Due date is required."),
  assigned_to: z.uuid("Choose a salesperson."),
  contact_id: nullableText,
  lead_id: nullableText,
});

export const leadNeedSchema = z.object({
  customer_need: z.string().trim().min(2, "Describe what the customer needs.").max(240),
  location_text: nullableText,
  notes: nullableText,
  next_follow_up_at: nullableText,
});
