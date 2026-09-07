export type UserRole = "admin" | "sales_manager" | "sales_rep";
export type LeadStatus = "new" | "contacted" | "qualified" | "site_visit" | "quotation" | "negotiation" | "won" | "lost";
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
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
