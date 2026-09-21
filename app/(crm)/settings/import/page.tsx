import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { LeadImportWizard } from "@/components/imports/lead-import-wizard";
import { PageIntro } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth";
import { getTeamProfiles } from "@/lib/phase2-data";

export default async function LeadImportPage() { const profile = await requireProfile(); if (profile.role !== "admin" && profile.role !== "sales_manager") redirect("/settings"); const profiles = await getTeamProfiles(); return <div className="space-y-6"><Link href="/settings" className="inline-flex items-center gap-1 text-xs font-semibold text-[#5b685e]"><ChevronLeft className="size-4" /> Back to settings</Link><PageIntro title="Master lead sheet import" description="Preview the workbook, map historical columns, validate contacts and confirm before any CRM write occurs." /><LeadImportWizard profiles={profiles} /></div>; }
