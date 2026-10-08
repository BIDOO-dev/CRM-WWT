import { z } from "zod";

const optionalText = z.string().trim().optional().or(z.literal(""));

export const outboundTextSchema = z.object({
  conversationId: z.uuid(),
  text: z.string().trim().min(1, "Write a message before sending.").max(4096, "Messages are limited to 4,096 characters."),
});

export const conversationNoteSchema = z.object({
  conversationId: z.uuid(),
  body: z.string().trim().min(2, "Enter a note before saving.").max(4000),
});

export const conversationStatusSchema = z.enum(["open", "pending", "closed"]);

export const convertConversationSchema = z.object({
  conversationId: z.uuid(),
  full_name: z.string().trim().min(2, "Enter the customer's name.").max(160),
  phone: z.string().trim().min(7, "Enter a valid phone number.").max(40),
  customer_need: z.string().trim().min(2, "Describe what the customer needs.").max(240),
  organization_name: optionalText,
  location_text: optionalText,
  priority: z.enum(["low", "medium", "high", "urgent"]),
  assigned_to: z.uuid("Choose a salesperson."),
});

export const channelAccountSettingsSchema = z.object({
  auto_create_leads: z.boolean(),
  default_assignee_id: z.union([z.uuid(), z.literal("")]),
  is_active: z.boolean(),
}).refine((value) => !value.auto_create_leads || Boolean(value.default_assignee_id), { message: "Choose a default salesperson before enabling automatic lead creation." });

export const aiInsightKindSchema = z.enum(["summary", "suggested_reply", "requirements", "intent", "follow_up", "next_action", "qualification"]);

export const outboundAttachmentTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4", "audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "text/plain",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
export const outboundAttachmentMaxBytes = 16 * 1024 * 1024;
