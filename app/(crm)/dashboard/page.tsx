import { Dashboard } from "@/components/dashboard";
import { requireProfile } from "@/lib/auth";
import { getDashboardData } from "@/lib/data";

export default async function DashboardPage() {
  const [profile, data] = await Promise.all([requireProfile(), getDashboardData()]);
  return <Dashboard name={profile.full_name.split(" ")[0]} role={profile.role} data={data} />;
}
