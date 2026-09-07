import { AuthLayout } from "@/components/auth-layout";
import { LoginForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  return <AuthLayout eyebrow="WWT commercial workspace" title="Welcome back" description="Sign in to manage customer contacts, leads and follow-ups."><LoginForm next={typeof params.next === "string" ? params.next : undefined} /></AuthLayout>;
}
