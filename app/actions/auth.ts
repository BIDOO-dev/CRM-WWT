"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isDemoMode } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";

export type AuthState = { message?: string; errors?: { email?: string[]; password?: string[] } };

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  if (isDemoMode()) redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { message: "Email or password is incorrect. Please try again." };
  const next = String(formData.get("next") || "/dashboard");
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function forgotPasswordAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const result = loginSchema.shape.email.safeParse(email);
  if (!result.success) return { errors: { email: result.error.issues.map((issue) => issue.message) } };
  if (!isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    const requestHeaders = await headers();
    const origin = requestHeaders.get("origin") || `https://${requestHeaders.get("host")}`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  }
  return { message: "If that address belongs to an active WWT account, a reset link has been sent." };
}

export async function resetPasswordAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 8) return { errors: { password: ["Password must be at least 8 characters."] } };
  if (password !== confirm) return { message: "The passwords do not match." };
  if (!isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { message: "This reset link is no longer valid. Request a new one." };
  }
  redirect("/login?reset=success");
}

export async function logoutAction() {
  if (!isDemoMode()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
