import { AuthLayout } from "@/components/auth-layout";
import { ResetPasswordForm } from "@/components/auth-form";

export default function ResetPasswordPage() {
  return <AuthLayout eyebrow="Secure your account" title="Choose a new password" description="Use at least eight characters and avoid reusing a personal password."><ResetPasswordForm /></AuthLayout>;
}
