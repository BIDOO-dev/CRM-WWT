"use client";

import { FileDown, LoaderCircle, PencilLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { generateQuotationPdfAction, updateQuotationStatusAction } from "@/app/actions/phase2";
import { Button, selectClass } from "@/components/ui/primitives";
import type { Quotation, QuotationStatus } from "@/lib/types";

const statuses: QuotationStatus[] = ["draft", "pending_approval", "approved", "sent", "accepted", "rejected", "expired"];
export function QuotationActions({ quotation, canApprove }: { quotation: Quotation; canApprove: boolean }) {
  const router = useRouter(); const [status, setStatus] = useState(quotation.status); const [pending, startTransition] = useTransition();
  function changeStatus(next: QuotationStatus) {
    if (next === "approved" && !canApprove) { toast.error("Only an administrator or sales manager can approve a quotation."); return; }
    const moveLead = next === "accepted" ? window.confirm("Also move the linked lead to Won? Choose Cancel to accept the quotation without closing the lead.") : false;
    const previous = status; setStatus(next); startTransition(async () => { const result = await updateQuotationStatusAction(quotation.id, next, moveLead); if (!result.ok) { setStatus(previous); toast.error(result.message); } else { toast.success(result.message); router.refresh(); } });
  }
  return <div className="flex flex-wrap gap-2"><Link href={`/quotes/${quotation.id}/edit`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce3dc] bg-white px-4 text-xs font-semibold text-[#4e5850] shadow-sm hover:bg-[#f7f9f7]"><PencilLine className="size-4" /> Edit / revise</Link><Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => { const result = await generateQuotationPdfAction(quotation.id); if (!result.ok) toast.error(result.message); else { toast.success(result.message); router.refresh(); } })}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <FileDown className="size-4" />} Generate PDF</Button><select aria-label="Quotation status" value={status} disabled={pending} onChange={(event) => changeStatus(event.target.value as QuotationStatus)} className={`${selectClass} h-10 w-auto min-w-44 text-xs font-semibold`}>{statuses.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>;
}
