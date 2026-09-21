import { z } from "zod";

const optionalText = z.string().trim().optional().or(z.literal(""));
const optionalNumber = z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().nonnegative().optional());
const optionalInteger = z.preprocess((value) => value === "" || value === null ? undefined : value, z.coerce.number().int().nonnegative().optional());

export const siteVisitSchema = z.object({
  contact_id: z.uuid("Choose a contact."),
  lead_id: z.uuid("Choose a lead."),
  assigned_employee_id: z.uuid("Choose an employee."),
  status: z.enum(["scheduled", "completed", "cancelled", "rescheduled"]),
  scheduled_at: z.string().min(1, "Choose a visit date and time."),
  site_location: z.string().trim().min(2, "Enter the site location."),
  project_name: z.string().trim().min(2, "Enter the project or customer name.").max(200),
  contact_person: optionalText,
  phone: optionalText,
  project_type: optionalText,
  wastewater_requirement: optionalText,
  requested_capacity: optionalNumber,
  capacity_unit: optionalText,
  estimated_flow: optionalNumber,
  flow_unit: optionalText,
  number_of_users: optionalInteger,
  application_sector: optionalText,
  notes: optionalText,
  observations: optionalText,
  recommendation: optionalText,
  next_action: optionalText,
  follow_up_date: optionalText,
});

export const quotationItemSchema = z.object({
  description: z.string().trim().min(2, "Describe each line item."),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unit: z.string().trim().min(1, "Enter a unit."),
  unit_price: z.coerce.number().nonnegative("Unit price cannot be negative."),
  discount_percent: z.coerce.number().min(0).max(100),
});

export const quotationSchema = z.object({
  contact_id: z.uuid("Choose a contact."),
  lead_id: z.uuid("Choose a lead."),
  site_visit_id: optionalText,
  project_name: z.string().trim().min(2, "Enter a project name.").max(200),
  salesperson_id: z.uuid("Choose a salesperson."),
  issue_date: z.iso.date("Choose an issue date."),
  expiration_date: z.iso.date("Choose a validity date."),
  currency: z.string().trim().length(3, "Use a three-letter currency code.").transform((value) => value.toUpperCase()),
  notes: optionalText,
  terms: optionalText,
  discount_amount: z.coerce.number().nonnegative("Discount cannot be negative."),
  tax_rate: z.coerce.number().min(0).max(100, "Tax rate cannot exceed 100%."),
  items: z.array(quotationItemSchema).min(1, "Add at least one quotation item."),
}).refine((value) => value.expiration_date >= value.issue_date, { message: "Validity date cannot be before the issue date.", path: ["expiration_date"] });

export const quotationStatusSchema = z.enum(["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "expired"]);

export const tenderSchema = z.object({
  title: z.string().trim().min(2, "Enter a tender title.").max(220),
  customer_entity: z.string().trim().min(2, "Enter the customer or entity."),
  contact_id: optionalText,
  reference_number: optionalText,
  description: optionalText,
  estimated_value: optionalNumber,
  currency: z.string().trim().length(3, "Use a three-letter currency code.").transform((value) => value.toUpperCase()),
  deadline: z.string().min(1, "Choose a deadline."),
  submission_date: optionalText,
  assigned_employee_id: z.uuid("Choose an employee."),
  source: optionalText,
  status: z.enum(["identified", "reviewing", "bid", "no_bid", "preparing", "submitted", "won", "lost"]),
  notes: optionalText,
  checklist: z.array(z.object({ label: z.string().trim().min(1), is_completed: z.boolean().default(false) })).default([]),
});

export const teamMemberSchema = z.object({
  full_name: z.string().trim().min(2).max(160),
  email: z.email("Enter a valid email address.").trim(),
  role: z.enum(["admin", "sales_manager", "sales_rep"]),
  manager_id: optionalText,
  is_active: z.boolean(),
});
