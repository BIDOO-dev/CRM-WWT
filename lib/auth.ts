import "server-only";

import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/config";
import { demoProfiles } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getCurrentProfile(): Promise<Profile | null> {
  if (isDemoMode()) return demoProfiles[0];

  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const id = claimsData?.claims?.sub;
  if (!id) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, phone, avatar_url, is_active")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export async function requireProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}
