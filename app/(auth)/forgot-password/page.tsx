import { AuthLayout } from "@/components/auth-layout";
import { ForgotPasswordForm } from "@/components/auth-form";

export default function ForgotPasswordPage() {
  return <AuthLayout eyebrow="Account recovery" title="Reset your password" description="Enter your WWT work email and we’ll send you a secure reset link."><ForgotPasswordForm /></AuthLayout>;
}
