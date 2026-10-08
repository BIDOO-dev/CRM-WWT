"use client";

import Link from "next/link";
import { Building2, CalendarClock, CalendarPlus, Check, ClipboardPlus, ContactRound, FilePlus2, Link2, LoaderCircle, Mail, MapPin, MessageSquarePlus, Phone, Radio, Sparkles, Target, UserPlus, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { createTaskAction, updateLeadStatusAction } from "@/app/actions/crm";
import { addConversationNoteAction, assignConversationAction, convertConversationToLeadAction, generateAiInsightAction, linkConversationAction, searchContactsForLinkAction, type ContactMatch } from "@/app/actions/inbox";
import { Drawer } from "@/components/inbox/inbox-ui";
import type { InboxWorkspaceProps } from "@/components/inbox/inbox-workspace";
import { QuotationForm } from "@/components/quotes/quotation-form";
import { SiteVisitForm } from "@/components/site-visits/site-visit-form";
import { Badge, Button, Field, inputClass, selectClass, textareaClass } from "@/components/ui/primitives";
import type { ConversationCrm } from "@/lib/inbox/data";
import { channelLabels, conversationTitle, type AiInsightKind, type ConversationSummary } from "@/lib/inbox/types";
import type { LeadStatus } from "@/lib/types";
import { formatCurrency, titleCase } from "@/lib/utils";

type Dialog = "task" | "visit" | "quote" | "note" | "convert" | "link" | null;
const stages: LeadStatus[] = ["new", "contacted", "qualified", "site_visit", "quotation", "negotiation", "won", "lost"];
const outlineLink = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dce3dc] bg-white px-3 text-xs font-semibold text-[#4e5850] shadow-sm hover:bg-[#f7f9f7]";

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not recorded";
}

export function CrmPanel({ conversation, crm, profile, profiles, canAssign, aiConfigured, defaultIssueDate, defaultExpirationDate, onClose }: InboxWorkspaceProps & { conversation: ConversationSummary; crm: ConversationCrm; onClose?: () => void }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [stagePending, startStage] = useTransition();
  const { contact, lead } = crm;
  const done = () => { setDialog(null); router.refresh(); };
  const title = conversationTitle(conversation);
  const latestQuote = crm.quotations[0];
  const openTasks = crm.tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");

  return (
    <div className="soft-scrollbar flex h-full flex-col overflow-y-auto">
      <div className="flex items-start gap-3 border-b border-[#edf0ed] p-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eaf3ea] text-[#448349]"><ContactRound className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[#1e2921]">{title}</h3>
          <p className="mt-0.5 text-[11px] text-[#7d867f]">{contact ? "CRM contact" : "Not in the CRM yet"} · {channelLabels[conversation.channel]}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{lead ? <><Badge value={lead.status} /><Badge value={lead.priority} /></> : !contact ? <span className="rounded-full bg-[#fff2d9] px-2.5 py-1 text-[10px] font-semibold text-[#9a641b]">New contact</span> : <span className="rounded-full bg-[#eff2ef] px-2.5 py-1 text-[10px] font-semibold text-[#606961]">No open lead</span>}</div>
        </div>
        {onClose ? <button type="button" onClick={onClose} aria-label="Close details" className="grid size-9 shrink-0 place-items-center rounded-lg text-[#818a83] hover:bg-[#f1f4f1]"><X className="size-4" /></button> : null}
      </div>

      {!contact ? (
        <div className="space-y-3 border-b border-[#edf0ed] p-4">
          <p className="text-xs leading-5 text-[#667068]">This sender does not match any contact by phone, email or channel identity. Create a lead, or link the conversation to an existing contact to avoid a duplicate.</p>
          <div className="grid gap-2">
            <Button onClick={() => setDialog("convert")}><UserPlus className="size-4" /> Convert to lead</Button>
            <Button variant="secondary" onClick={() => setDialog("link")}><Link2 className="size-4" /> Link existing contact</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 border-b border-[#edf0ed] p-4">
          {lead ? <Link href={`/leads/${lead.slug}`} className={outlineLink}><Target className="size-4" /> Open lead</Link> : <button type="button" onClick={() => setDialog("convert")} className={outlineLink}><UserPlus className="size-4" /> New lead</button>}
          <Link href={`/contacts/${contact.slug}`} className={outlineLink}><ContactRound className="size-4" /> Open customer</Link>
          <button type="button" onClick={() => setDialog("task")} className={outlineLink}><ClipboardPlus className="size-4" /> Create task</button>
          <button type="button" disabled={!lead} title={lead ? undefined : "Link a lead first"} onClick={() => setDialog("visit")} className={`${outlineLink} disabled:opacity-50`}><CalendarPlus className="size-4" /> Schedule visit</button>
          <button type="button" disabled={!lead} title={lead ? undefined : "Link a lead first"} onClick={() => setDialog("quote")} className={`${outlineLink} disabled:opacity-50`}><FilePlus2 className="size-4" /> Create quotation</button>
          <button type="button" onClick={() => setDialog("note")} className={outlineLink}><MessageSquarePlus className="size-4" /> Add note</button>
        </div>
      )}
      {!contact ? <div className="border-b border-[#edf0ed] p-4"><Button variant="secondary" className="w-full" onClick={() => setDialog("note")}><MessageSquarePlus className="size-4" /> Add internal note</Button></div> : null}

      <Section title="Details">
        <dl className="grid gap-3.5">
          <Info icon={<UserRound />} label="Name" value={contact?.full_name ?? conversation.display_name ?? "Unknown"} />
          <Info icon={<Phone />} label="Phone" value={contact?.phone ?? (conversation.channel === "whatsapp" ? conversation.external_handle : null) ?? "Not provided"} />
          <Info icon={<Mail />} label="Email" value={contact?.email ? <a href={`mailto:${contact.email}`} className="break-all text-[#448349] hover:underline">{contact.email}</a> : "Not provided"} />
          <Info icon={<Building2 />} label="Company" value={contact?.organization_name ?? "Not provided"} />
          <Info icon={<MapPin />} label="Location" value={lead?.location_text ?? contact?.location_text ?? "Not provided"} />
          <Info icon={<Radio />} label="Receiving account" value={`${conversation.account_name}${conversation.account_identifier ? ` · ${conversation.account_identifier}` : ""}`} />
          <div className="flex gap-2.5"><span className="mt-0.5 text-[#82a886] [&_svg]:size-4"><UserRound /></span><div className="min-w-0 flex-1"><dt className="text-[9px] font-bold uppercase tracking-[.1em] text-[#929a93]">Conversation owner</dt><dd className="mt-1 text-xs font-medium text-[#4c574f]">{canAssign ? <select aria-label="Conversation owner" disabled={stagePending} value={conversation.assigned_to ?? ""} onChange={(event) => startStage(async () => { const result = await assignConversationAction(conversation.id, event.target.value || null); if (!result.ok) toast.error(result.message); else toast.success(result.message); router.refresh(); })} className={`${selectClass} h-10`}><option value="">Unassigned</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select> : conversation.assigned_to ? conversation.assigned_name ?? "Assigned" : "Unassigned"}</dd></div></div>
          <Info icon={<CalendarClock />} label="Last contact" value={formatDateTime(lead?.last_contacted_at ?? contact?.last_interaction_at ?? conversation.last_message_at)} />
        </dl>
      </Section>

      {contact ? (
        <Section title="Lead" action={crm.contactLeads.length > 1 || (!lead && crm.contactLeads.length) ? <button type="button" onClick={() => setDialog("link")} className="text-[11px] font-semibold text-[#448349] hover:underline">Change lead</button> : null}>
          {lead ? (
            <dl className="grid gap-3.5">
              <Info icon={<Target />} label="Customer need" value={lead.customer_need} />
              <div>
                <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-[#929a93]">Lead stage</dt>
                <dd className="mt-1"><select aria-label="Lead stage" disabled={stagePending} value={lead.status} onChange={(event) => startStage(async () => { const result = await updateLeadStatusAction(lead.id, event.target.value as LeadStatus); if (!result.ok) toast.error(result.message); else toast.success(result.message); router.refresh(); })} className={`${selectClass} h-10`}>{stages.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></dd>
              </div>
              <Info icon={<Radio />} label="Lead source" value={titleCase(lead.source)} />
              <Info icon={<UserRound />} label="Assigned salesperson" value={lead.assigned_name} />
              <Info icon={<FilePlus2 />} label="Estimated value" value={latestQuote ? `${formatCurrency(latestQuote.total, latestQuote.currency)} · ${latestQuote.quote_number}` : "No quotation yet"} />
              <Info icon={<CalendarClock />} label="Next follow-up" value={formatDateTime(lead.next_follow_up_at)} />
              {lead.notes ? <Info icon={<MessageSquarePlus />} label="Lead notes" value={<span className="whitespace-pre-wrap">{lead.notes}</span>} /> : null}
            </dl>
          ) : <p className="text-xs leading-5 text-[#7d867f]">This contact has no open lead linked to the conversation.</p>}
        </Section>
      ) : null}

      <Section title={`Internal notes${crm.notes.length ? ` (${crm.notes.length})` : ""}`}>
        {crm.notes.length ? <ul className="space-y-3">{crm.notes.map((note) => <li key={note.id} className="rounded-lg bg-[#fffbea] px-3 py-2"><p className="whitespace-pre-wrap text-xs leading-5 text-[#4f4a2e]" dir="auto">{note.body}</p><p className="mt-1 text-[10px] text-[#8f8960]">{note.author_name} · {formatDateTime(note.created_at)}</p></li>)}</ul> : <p className="text-xs text-[#8b948c]">No internal notes. Notes are never sent to the customer.</p>}
      </Section>

      {contact ? (
        <>
          <Section title={`Tasks${openTasks.length ? ` (${openTasks.length} open)` : ""}`}>
            {crm.tasks.length ? <ul className="space-y-2">{crm.tasks.slice(0, 5).map((task) => <li key={task.id} className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate text-xs font-medium text-[#39463c]">{task.title}</span><span className="text-[10px] text-[#8b948c]">Due {formatDateTime(task.due_at)}</span></span><Badge value={task.status} /></li>)}</ul> : <p className="text-xs text-[#8b948c]">No tasks for this contact.</p>}
          </Section>
          <Section title="Site visits">
            {crm.visits.length ? <ul className="space-y-2">{crm.visits.slice(0, 4).map((visit) => <li key={visit.id}><Link href={`/site-visits/${visit.id}`} className="flex items-start justify-between gap-2 hover:underline"><span className="min-w-0"><span className="block truncate text-xs font-medium text-[#39463c]">{visit.project_name}</span><span className="text-[10px] text-[#8b948c]">{formatDateTime(visit.scheduled_at)}</span></span><span className="shrink-0 rounded-full bg-[#eff2ef] px-2 py-0.5 text-[9px] font-semibold text-[#606961]">{titleCase(visit.status)}</span></Link></li>)}</ul> : <p className="text-xs text-[#8b948c]">No site visits yet.</p>}
          </Section>
          <Section title="Quotations">
            {crm.quotations.length ? <ul className="space-y-2">{crm.quotations.slice(0, 4).map((quote) => <li key={quote.id}><Link href={`/quotes/${quote.id}`} className="flex items-start justify-between gap-2 hover:underline"><span className="min-w-0"><span className="block truncate text-xs font-medium text-[#39463c]">{quote.quote_number} · {formatCurrency(quote.total, quote.currency)}</span><span className="block truncate text-[10px] text-[#8b948c]">{quote.project_name}</span></span><span className="shrink-0 rounded-full bg-[#eff2ef] px-2 py-0.5 text-[9px] font-semibold text-[#606961]">{titleCase(quote.status)}</span></Link></li>)}</ul> : <p className="text-xs text-[#8b948c]">No quotations yet.</p>}
          </Section>
        </>
      ) : null}

      <AiAssistant conversationId={conversation.id} configured={aiConfigured} />

      {dialog === "note" ? <Drawer title="Add internal note" onClose={() => setDialog(null)}><NoteForm conversationId={conversation.id} onDone={done} /></Drawer> : null}
      {dialog === "task" && contact ? <Drawer title="Create task" onClose={() => setDialog(null)}><TaskForm contactId={contact.id} leadId={lead?.id} defaultTitle={`Follow up with ${contact.full_name}`} profiles={profiles} currentUserId={profile.id} canAssign={canAssign} onDone={done} /></Drawer> : null}
      {dialog === "visit" && contact && lead ? <Drawer wide title="Schedule site visit" onClose={() => setDialog(null)}><SiteVisitForm profiles={profiles} contacts={[contact]} leads={crm.contactLeads} currentUserId={profile.id} initialLeadId={lead.id} onSaved={done} onCancel={() => setDialog(null)} /></Drawer> : null}
      {dialog === "quote" && contact && lead ? <Drawer wide title="Create quotation" onClose={() => setDialog(null)}><QuotationForm profiles={profiles} contacts={[contact]} leads={crm.contactLeads} siteVisits={crm.visits} currentUserId={profile.id} initialLeadId={lead.id} defaultIssueDate={defaultIssueDate} defaultExpirationDate={defaultExpirationDate} onSaved={done} onCancel={() => setDialog(null)} /></Drawer> : null}
      {dialog === "convert" ? <Drawer title={contact ? "Create a new lead" : "Convert to lead"} onClose={() => setDialog(null)}><ConvertForm conversation={conversation} crm={crm} profiles={profiles} currentUserId={profile.id} canAssign={canAssign} onDone={done} /></Drawer> : null}
      {dialog === "link" ? <Drawer title={contact ? "Link a different lead" : "Link existing contact"} onClose={() => setDialog(null)}><LinkForm conversationId={conversation.id} crm={crm} onDone={done} /></Drawer> : null}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="border-b border-[#edf0ed] p-4"><div className="mb-3 flex items-center justify-between"><h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b948c]">{title}</h4>{action}</div>{children}</section>;
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return <div className="flex gap-2.5"><span className="mt-0.5 text-[#82a886] [&_svg]:size-4">{icon}</span><div className="min-w-0"><dt className="text-[9px] font-bold uppercase tracking-[.1em] text-[#929a93]">{label}</dt><dd className="mt-0.5 break-words text-xs font-medium text-[#4c574f]" dir="auto">{value}</dd></div></div>;
}

function SubmitRow({ pending, label }: { pending: boolean; label: string }) {
  return <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {label}</Button></div>;
}

function NoteForm({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return <form action={(formData) => startTransition(async () => { const result = await addConversationNoteAction({ conversationId, body: String(formData.get("body") ?? "") }); if (!result.ok) toast.error(result.message); else { toast.success(result.message); onDone(); } })} className="space-y-4"><Field label="Note" hint="Visible to the team only. Linked records also show it on their timeline."><textarea name="body" required autoFocus className={textareaClass} placeholder="Add context for whoever picks this conversation up next..." /></Field><SubmitRow pending={pending} label="Save note" /></form>;
}

function TaskForm({ contactId, leadId, defaultTitle, profiles, currentUserId, canAssign, onDone }: { contactId: string; leadId?: string; defaultTitle: string; profiles: InboxWorkspaceProps["profiles"]; currentUserId: string; canAssign: boolean; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <form action={(formData) => startTransition(async () => { const result = await createTaskAction({ ...Object.fromEntries(formData), contact_id: contactId, lead_id: leadId ?? "" }); if (!result.ok) toast.error(result.message); else { toast.success(result.message); onDone(); } })} className="space-y-4">
      <Field label="Task"><input name="title" required defaultValue={defaultTitle} className={inputClass} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type"><select name="task_type" defaultValue="follow_up" className={selectClass}>{["follow_up", "call", "whatsapp", "email", "meeting", "site_visit", "other"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
        <Field label="Priority"><select name="priority" defaultValue="medium" className={selectClass}>{["low", "medium", "high", "urgent"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
        <Field label="Due"><input name="due_at" type="datetime-local" required className={inputClass} /></Field>
        <Field label="Assigned to"><select name="assigned_to" defaultValue={currentUserId} disabled={!canAssign} className={selectClass}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select>{!canAssign ? <input type="hidden" name="assigned_to" value={currentUserId} /> : null}</Field>
      </div>
      <Field label="Details"><textarea name="description" className={textareaClass} /></Field>
      <SubmitRow pending={pending} label="Create task" />
    </form>
  );
}

function ConvertForm({ conversation, crm, profiles, currentUserId, canAssign, onDone }: { conversation: ConversationSummary; crm: ConversationCrm; profiles: InboxWorkspaceProps["profiles"]; currentUserId: string; canAssign: boolean; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const phone = crm.contact?.phone ?? (conversation.channel === "whatsapp" ? conversation.external_handle ?? `+${conversation.external_thread_id}` : "");
  return (
    <form action={(formData) => startTransition(async () => { const result = await convertConversationToLeadAction({ ...Object.fromEntries(formData), conversationId: conversation.id }); if (!result.ok) toast.error(result.message); else { toast.success(result.message); onDone(); } })} className="space-y-4">
      <p className="rounded-lg bg-[#f1f6f1] px-3 py-2 text-[11px] leading-5 text-[#4f6253]">If a contact already uses this phone number, the lead is added to that contact instead of creating a duplicate.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name"><input name="full_name" required defaultValue={crm.contact?.full_name ?? conversation.display_name ?? ""} className={inputClass} /></Field>
        <Field label="Phone" hint={conversation.channel === "whatsapp" ? undefined : "Required to create a CRM contact."}><input name="phone" required inputMode="tel" defaultValue={phone} className={inputClass} /></Field>
        <Field label="Company"><input name="organization_name" defaultValue={crm.contact?.organization_name ?? ""} className={inputClass} /></Field>
        <Field label="Location"><input name="location_text" defaultValue={crm.contact?.location_text ?? ""} className={inputClass} /></Field>
      </div>
      <Field label="What the customer needs"><input name="customer_need" required maxLength={240} defaultValue={(crm.firstInboundBody ?? "").replace(/\s+/g, " ").slice(0, 200)} className={inputClass} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority"><select name="priority" defaultValue="medium" className={selectClass}>{["low", "medium", "high", "urgent"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></Field>
        <Field label="Assigned salesperson"><select name="assigned_to" defaultValue={conversation.assigned_to ?? currentUserId} disabled={!canAssign} className={selectClass}>{profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select>{!canAssign ? <input type="hidden" name="assigned_to" value={currentUserId} /> : null}</Field>
      </div>
      <SubmitRow pending={pending} label="Create lead" />
    </form>
  );
}

function LinkForm({ conversationId, crm, onDone }: { conversationId: string; crm: ConversationCrm; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactMatch[]>([]);
  const [searching, startSearch] = useTransition();
  const [pending, startTransition] = useTransition();
  const link = (contactId: string, leadId: string | null) => startTransition(async () => { const result = await linkConversationAction(conversationId, contactId, leadId); if (!result.ok) toast.error(result.message); else { toast.success(result.message); onDone(); } });

  if (crm.contact) {
    const contact = crm.contact;
    return <div className="space-y-2">{crm.contactLeads.length ? crm.contactLeads.map((lead) => <button key={lead.id} type="button" disabled={pending} onClick={() => link(contact.id, lead.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#dce3dc] px-3 py-2.5 text-left hover:bg-[#f7f9f7] disabled:opacity-60"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#39463c]">{lead.customer_need}</span><span className="text-[10px] text-[#8b948c]">Received {new Date(lead.received_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></span><Badge value={lead.status} /></button>) : <p className="text-xs text-[#8b948c]">This contact has no leads yet.</p>}</div>;
  }
  return (
    <div className="space-y-4">
      <form onSubmit={(event) => { event.preventDefault(); startSearch(async () => setResults(await searchContactsForLinkAction(query))); }} className="flex gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder="Search by name, company or phone..." aria-label="Search contacts" className={inputClass} />
        <Button type="submit" variant="secondary" disabled={searching || query.trim().length < 2}>{searching ? <LoaderCircle className="size-4 animate-spin" /> : "Search"}</Button>
      </form>
      <div className="space-y-2">{results.map((contact) => <button key={contact.id} type="button" disabled={pending} onClick={() => link(contact.id, null)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#dce3dc] px-3 py-2.5 text-left hover:bg-[#f7f9f7] disabled:opacity-60"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#39463c]">{contact.full_name}</span><span className="block truncate text-[10px] text-[#8b948c]">{[contact.phone, contact.organization_name].filter(Boolean).join(" · ")}</span></span><Link2 className="size-4 shrink-0 text-[#82a886]" /></button>)}</div>
    </div>
  );
}

const aiActions: { kind: AiInsightKind; label: string }[] = [
  { kind: "summary", label: "Summarize" },
  { kind: "requirements", label: "Extract requirements" },
  { kind: "intent", label: "Detect intent" },
  { kind: "qualification", label: "Qualify lead" },
  { kind: "next_action", label: "Next CRM action" },
  { kind: "follow_up", label: "Draft follow-up" },
];

function AiAssistant({ conversationId, configured }: { conversationId: string; configured: boolean }) {
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<AiInsightKind | null>(null);
  const [result, setResult] = useState<{ kind: AiInsightKind; content: Record<string, unknown> } | null>(null);
  const run = (kind: AiInsightKind) => { setActive(kind); startTransition(async () => { const response = await generateAiInsightAction(conversationId, kind); if (!response.ok) toast.error(response.message); else setResult({ kind: response.kind, content: response.content }); setActive(null); }); };
  return (
    <section className="p-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b948c]"><Sparkles className="size-3.5 text-[#6b5a9a]" /> AI assistant</h4>
      {configured ? (
        <>
          <div className="flex flex-wrap gap-1.5">{aiActions.map((item) => <button key={item.kind} type="button" disabled={pending} onClick={() => run(item.kind)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#dcd6ea] bg-white px-3 text-[11px] font-semibold text-[#5b4c88] hover:bg-[#f6f3fb] disabled:opacity-60">{active === item.kind ? <LoaderCircle className="size-3 animate-spin" /> : null}{item.label}</button>)}</div>
          {result ? <div className="mt-3 rounded-lg border border-[#e6e1f1] bg-[#faf8fd] p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#6b5a9a]">{aiActions.find((item) => item.kind === result.kind)?.label}</p><InsightView content={result.content} /><p className="mt-3 text-[10px] text-[#8b85a0]">AI output can be wrong. Check it against the conversation before acting on it.</p></div> : null}
        </>
      ) : <p className="text-xs leading-5 text-[#8b948c]">Summaries, reply drafts, requirement extraction and next-step suggestions are ready to use once an administrator adds the AI API key on the server. Drafts always need an employee to review and send them.</p>}
    </section>
  );
}

function InsightView({ content }: { content: Record<string, unknown> }) {
  return (
    <dl className="space-y-2.5">
      {Object.entries(content).filter(([, value]) => value !== null && value !== "" && !(Array.isArray(value) && !value.length)).map(([key, value]) => (
        <div key={key}>
          <dt className="text-[9px] font-bold uppercase tracking-[.1em] text-[#8b85a0]">{titleCase(key)}</dt>
          <dd className="mt-0.5 text-xs leading-5 text-[#3f3a52]" dir="auto">
            {Array.isArray(value) ? <ul className="list-disc space-y-1 pl-4">{value.map((item, index) => <li key={index}>{typeof item === "object" && item !== null ? Object.values(item as Record<string, unknown>).filter(Boolean).map((part) => titleCase(String(part))).join(" · ") : String(item)}</li>)}</ul> : <span className="whitespace-pre-wrap">{typeof value === "string" && /^[a-z_]+$/.test(value) ? titleCase(value) : String(value)}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
