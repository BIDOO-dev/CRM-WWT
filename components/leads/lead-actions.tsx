"use client";

import Link from "next/link";
import { Check, ChevronDown, ClipboardPlus, LoaderCircle, MessageSquarePlus, PencilLine, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addActivityNoteAction, updateLeadNeedAction, updateLeadStatusAction } from "@/app/actions/crm";
import { Button, Field, inputClass, textareaClass } from "@/components/ui/primitives";
import type { Lead } from "@/lib/types";
import { titleCase } from "@/lib/utils";

const statuses: Lead["status"][] = ["new", "contacted", "qualified", "site_visit", "quotation", "negotiation", "won", "lost"];

export function LeadActions({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [status, setStatus] = useState(lead.status);
  const [noteOpen, setNoteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const updateStatus = (next: Lead["status"]) => { const previous = status; setStatus(next); startTransition(async () => { const result = await updateLeadStatusAction(lead.id, next); if (!result.ok) { setStatus(previous); toast.error(result.message); } else { toast.success(result.message); router.refresh(); } }); };
  return <><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setEditOpen(true)}><PencilLine className="size-4" /> Edit need</Button><Button variant="secondary" onClick={() => setNoteOpen(true)}><MessageSquarePlus className="size-4" /> Add note</Button><Link href={`/tasks?lead=${lead.id}&contact=${lead.contact_id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce3dc] bg-white px-4 text-xs font-semibold text-[#4e5850] shadow-sm hover:bg-[#f7f9f7]"><ClipboardPlus className="size-4" /> Create task</Link><div className="relative"><select aria-label="Change lead stage" value={status} disabled={pending} onChange={(event) => updateStatus(event.target.value as Lead["status"])} className="h-10 appearance-none rounded-lg border border-[#dce3dc] bg-white pl-3 pr-8 text-xs font-semibold text-[#4e5850]">{statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#879088]" /></div></div>{noteOpen ? <Modal title="Add activity note" onClose={() => setNoteOpen(false)}><NoteForm leadId={lead.id} onDone={() => { setNoteOpen(false); router.refresh(); }} /></Modal> : null}{editOpen ? <Modal title="Edit lead details" onClose={() => setEditOpen(false)}><EditLeadForm lead={lead} onDone={() => { setEditOpen(false); router.refresh(); }} /></Modal> : null}</>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[70] grid place-items-end bg-[#172019]/35 backdrop-blur-[2px] sm:place-items-center sm:p-5"><div className="max-h-[92vh] w-full overflow-auto bg-white shadow-2xl sm:max-w-lg sm:rounded-xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e7ebe7] bg-white px-5 py-4"><h3 className="text-sm font-semibold text-[#29352c]">{title}</h3><button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-[#818a83] hover:bg-[#f1f4f1]"><X className="size-4" /></button></div><div className="p-5">{children}</div></div></div>;
}

function NoteForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const [note, setNote] = useState(""); const [pending, startTransition] = useTransition();
  return <div><Field label="Note"><textarea value={note} onChange={(event) => setNote(event.target.value)} className={textareaClass} autoFocus placeholder="Add context for the next person viewing this lead..." /></Field><div className="mt-4 flex justify-end"><Button disabled={pending || note.trim().length < 2} onClick={() => startTransition(async () => { const result = await addActivityNoteAction({ subjectId: leadId, subjectType: "lead", description: note }); if (!result.ok) toast.error(result.message); else { toast.success(result.message); onDone(); } })}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Save note</Button></div></div>;
}

function EditLeadForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return <form action={(formData) => startTransition(async () => { const result = await updateLeadNeedAction(lead.id, Object.fromEntries(formData)); if (!result.ok) toast.error(result.message); else { toast.success(result.message); onDone(); } })} className="space-y-4"><Field label="What the customer needs"><input name="customer_need" defaultValue={lead.customer_need} className={inputClass} required /></Field><Field label="Location"><input name="location_text" defaultValue={lead.location_text ?? ""} className={inputClass} /></Field><Field label="Next follow-up"><input name="next_follow_up_at" type="datetime-local" defaultValue={lead.next_follow_up_at?.slice(0, 16) ?? ""} className={inputClass} /></Field><Field label="Notes"><textarea name="notes" defaultValue={lead.notes ?? ""} className={textareaClass} /></Field><div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Save changes</Button></div></form>;
}
