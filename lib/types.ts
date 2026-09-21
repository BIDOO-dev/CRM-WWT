export type UserRole = "admin" | "sales_manager" | "sales_rep";
export type LeadStatus = "new" | "contacted" | "qualified" | "site_visit" | "quotation" | "negotiation" | "won" | "lost";
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
export type SiteVisitStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";
export type QuotationStatus = "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "rejected" | "expired";
export type TenderStatus = "identified" | "reviewing" | "bid" | "no_bid" | "preparing" | "submitted" | "won" | "lost";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  manager_id?: string | null;
  manager_name?: string | null;
}

export interface Contact {
  id: string;
  slug: string;
  full_name: string;
  phone: string;
  phone_normalized?: string | null;
  whatsapp_number?: string | null;
  whatsapp_normalized?: string | null;
  email?: string | null;
  location_text?: string | null;
  organization_name?: string | null;
  notes?: string | null;
  owner_id: string;
  owner_name: string;
  created_at: string;
  last_interaction_at?: string | null;
  lead_count: number;
}

export interface Lead {
  id: string;
  slug: string;
  contact_id: string;
  contact_name: string;
  phone: string;
  source: string;
  receiving_whatsapp_number?: string | null;
  receiving_whatsapp_normalized?: string | null;
  campaign_source?: string | null;
  customer_need: string;
  location_text?: string | null;
  status: LeadStatus;
  priority: Priority;
  assigned_to: string;
  assigned_name: string;
  received_at: string;
  created_at: string;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  notes?: string | null;
  original_message?: string | null;
  contact_email?: string | null;
  organization_name?: string | null;
}

export interface CrmTask {
  id: string;
  title: string;
  description?: string | null;
  task_type: string;
  status: TaskStatus;
  priority: Priority;
  due_at: string;
  assigned_to: string;
  assigned_name: string;
  contact_id?: string | null;
  contact_name?: string | null;
  lead_id?: string | null;
  lead_need?: string | null;
  completed_at?: string | null;
}

export interface Activity {
  id: string;
  activity_type: string;
  subject: string;
  description: string;
  user_name: string;
  occurred_at: string;
}

export interface CrmFile {
  id: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_path: string;
  created_at: string;
  download_url?: string | null;
}

export interface SiteVisit {
  id: string;
  contact_id: string;
  contact_name: string;
  lead_id: string;
  lead_need: string;
  assigned_employee_id: string;
  assigned_name: string;
  status: SiteVisitStatus;
  scheduled_at: string;
  site_location: string;
  project_name: string;
  contact_person?: string | null;
  phone?: string | null;
  project_type?: string | null;
  wastewater_requirement?: string | null;
  requested_capacity?: number | null;
  capacity_unit?: string | null;
  estimated_flow?: number | null;
  flow_unit?: string | null;
  number_of_users?: number | null;
  application_sector?: string | null;
  notes?: string | null;
  observations?: string | null;
  recommendation?: string | null;
  next_action?: string | null;
  follow_up_date?: string | null;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface Quotation {
  id: string;
  quote_number: string;
  contact_id: string;
  contact_name: string;
  lead_id: string;
  lead_need: string;
  site_visit_id?: string | null;
  project_name: string;
  salesperson_id: string;
  salesperson_name: string;
  status: QuotationStatus;
  current_version: number;
  version_id: string;
  issue_date: string;
  expiration_date: string;
  currency: string;
  notes?: string | null;
  terms?: string | null;
  discount_amount: number;
  tax_rate: number;
  subtotal: number;
  line_discount_total: number;
  tax_total: number;
  total: number;
  pdf_path?: string | null;
  pdf_generated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotationVersion {
  id: string;
  quotation_id: string;
  version_number: number;
  issue_date: string;
  expiration_date: string;
  currency: string;
  notes?: string | null;
  terms?: string | null;
  discount_amount: number;
  tax_rate: number;
  subtotal: number;
  line_discount_total: number;
  tax_total: number;
  total: number;
  pdf_path?: string | null;
  pdf_generated_at?: string | null;
  created_at: string;
}

export interface QuotationItem {
  id: string;
  quotation_version_id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
  line_total: number;
}

export interface Tender {
  id: string;
  title: string;
  customer_entity: string;
  contact_id?: string | null;
  contact_name?: string | null;
  reference_number?: string | null;
  description?: string | null;
  estimated_value?: number | null;
  currency: string;
  deadline: string;
  submission_date?: string | null;
  assigned_employee_id: string;
  assigned_name: string;
  source?: string | null;
  status: TenderStatus;
  notes?: string | null;
  checklist_count: number;
  checklist_completed: number;
  created_at: string;
  updated_at: string;
}

export interface TenderChecklistItem {
  id: string;
  tender_id: string;
  label: string;
  is_completed: boolean;
  position: number;
  completed_at?: string | null;
  completed_by?: string | null;
}
