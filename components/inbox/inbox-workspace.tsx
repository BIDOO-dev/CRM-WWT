"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock3, FileText, Inbox, LoaderCircle, PanelRight, Paperclip, Search, SendHorizontal, Sparkles, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { assignConversationAction, generateAiInsightAction, markConversationReadAction, sendAttachmentAction, sendMessageAction, setConversationStatusAction } from "@/app/actions/inbox";
import { CrmPanel } from "@/components/inbox/crm-panel";
import { ChannelIcon, formatListTime } from "@/components/inbox/inbox-ui";
import { Badge, EmptyState } from "@/components/ui/primitives";
import type { ConversationCrm } from "@/lib/inbox/data";
import { channelLabels, conversationTitle, type ChannelKind, type ConversationStatus, type ConversationSummary, type InboxMessage } from "@/lib/inbox/types";
import { replyWindow } from "@/lib/inbox/window";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { cn, initials, titleCase } from "@/lib/utils";

type Scope = "mine" | "unassigned" | "all";

export type InboxWorkspaceProps = {
  conversations: ConversationSummary[];
  selected: ConversationSummary | null;
  messages: InboxMessage[];
  crm: ConversationCrm | null;
  profile: Profile;
  profiles: Profile[];
  canAssign: boolean;
  liveUpdates: boolean;
  aiConfigured: boolean;
  nowMs: number;
  defaultIssueDate: string;
  defaultExpirationDate: string;
};

export function InboxWorkspace(props: InboxWorkspaceProps) {
  const { conversations, selected, profile, canAssign, liveUpdates, nowMs } = props;
  const router = useRouter();
  const [scope, setScope] = useState<Scope>(canAssign ? "all" : "mine");
  const [channel, setChannel] = useState<ChannelKind | "all">("all");
  const [showClosed, setShowClosed] = useState(false);
  const [search, setSearch] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Refresh server data when a message or conversation changes. Realtime applies the same RLS as queries;
  // the interval covers projects where Realtime is not enabled.
  useEffect(() => {
    if (!liveUpdates) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 400); };
    const supabase = createSupabaseBrowserClient();
    const subscription = supabase.channel("inbox-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe();
    const interval = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30000);
    return () => { clearTimeout(timer); clearInterval(interval); void supabase.removeChannel(subscription); };
  }, [liveUpdates, router]);

  const selectedId = selected?.id;
  const selectedUnread = selected?.is_unread;
  useEffect(() => {
    if (!selectedId || !selectedUnread) return;
    void markConversationReadAction(selectedId).then(() => router.refresh());
  }, [selectedId, selectedUnread, router]);

  const availableChannels = useMemo(() => Array.from(new Set(conversations.map((item) => item.channel))), [conversations]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((item) => {
      if (scope === "mine" && item.assigned_to !== profile.id) return false;
      if (scope === "unassigned" && item.assigned_to) return false;
      if (channel !== "all" && item.channel !== channel) return false;
      if (!showClosed && item.status === "closed" && item.id !== selectedId) return false;
      if (!term) return true;
      return `${conversationTitle(item)} ${item.external_handle ?? ""} ${item.last_message_preview ?? ""} ${item.lead_need ?? ""}`.toLowerCase().includes(term);
    });
  }, [channel, conversations, profile.id, scope, search, selectedId, showClosed]);
  const unassignedCount = useMemo(() => conversations.filter((item) => !item.assigned_to && item.status !== "closed").length, [conversations]);
  const scopes: { value: Scope; label: string }[] = canAssign ? [{ value: "all", label: "All" }, { value: "mine", label: "Mine" }, { value: "unassigned", label: `Unassigned${unassignedCount ? ` (${unassignedCount})` : ""}` }] : [{ value: "mine", label: "Mine" }, { value: "all", label: "All visible" }];

  return (
    <div className="-m-4 flex h-[calc(100dvh-72px)] overflow-hidden border-t border-[#e4e9e4] bg-white sm:-m-6 lg:-m-8">
      <aside className={cn("w-full shrink-0 flex-col border-r border-[#e4e9e4] md:flex md:w-[320px] xl:w-[340px]", selected ? "hidden" : "flex")} aria-label="Conversations">
        <div className="space-y-3 border-b border-[#edf0ed] p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#929a93]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations..." aria-label="Search conversations" className="h-10 w-full rounded-lg border border-[#dce3dc] bg-[#fafbfa] pl-9 pr-3 text-sm placeholder:text-[#a0a7a1]" />
          </div>
          <div className="flex gap-1 rounded-lg bg-[#f1f4f1] p-1" role="tablist" aria-label="Conversation scope">
            {scopes.map((item) => <button key={item.value} type="button" role="tab" aria-selected={scope === item.value} onClick={() => setScope(item.value)} className={cn("min-h-8 flex-1 rounded-md px-2 text-[11px] font-semibold transition-colors", scope === item.value ? "bg-white text-[#315f38] shadow-sm" : "text-[#69736b] hover:text-[#29352c]")}>{item.label}</button>)}
          </div>
          <div className="flex items-center gap-2">
            <select value={channel} onChange={(event) => setChannel(event.target.value as ChannelKind | "all")} aria-label="Filter by channel" className="h-8 flex-1 rounded-lg border border-[#dce3dc] bg-white px-2 text-[11px] font-medium text-[#4e5850]">
              <option value="all">All channels</option>
              {availableChannels.map((value) => <option key={value} value={value}>{channelLabels[value]}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#69736b]"><input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} className="size-3.5 accent-[#448349]" /> Closed</label>
          </div>
        </div>
        <div className="soft-scrollbar flex-1 overflow-y-auto">
          {rows.length ? rows.map((item) => <ConversationRow key={item.id} conversation={item} active={item.id === selectedId} nowMs={nowMs} />) : <p className="px-6 py-12 text-center text-xs leading-5 text-[#8b948c]">{conversations.length ? "No conversations match these filters." : "No conversations yet. Messages will appear here as soon as a channel is connected and a customer writes in."}</p>}
        </div>
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col", selected ? "flex" : "hidden md:flex")} aria-label="Conversation">
        {selected ? <Thread key={selected.id} {...props} selected={selected} onOpenDetails={() => setDetailsOpen(true)} /> : <EmptyState icon={<Inbox className="size-5" />} title="Select a conversation" description="Choose a conversation on the left to read the history and reply." />}
      </section>

      {selected && props.crm ? (
        <>
          <aside className="hidden w-[340px] shrink-0 border-l border-[#e4e9e4] xl:block" aria-label="CRM details"><CrmPanel {...props} conversation={selected} crm={props.crm} /></aside>
          {detailsOpen ? (
            <div className="fixed inset-0 z-[60] xl:hidden">
              <button type="button" aria-label="Close details" className="absolute inset-0 bg-[#172019]/35 backdrop-blur-[2px]" onClick={() => setDetailsOpen(false)} />
              <aside className="absolute inset-y-0 right-0 w-full max-w-[380px] bg-white shadow-2xl" aria-label="CRM details"><CrmPanel {...props} conversation={selected} crm={props.crm} onClose={() => setDetailsOpen(false)} /></aside>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ConversationRow({ conversation, active, nowMs }: { conversation: ConversationSummary; active: boolean; nowMs: number }) {
  const title = conversationTitle(conversation);
  return (
    <Link href={`/inbox?c=${conversation.id}`} scroll={false} aria-current={active ? "true" : undefined} className={cn("flex gap-3 border-b border-[#f0f2f0] px-3 py-3 transition-colors", active ? "bg-[#eef5ee]" : "hover:bg-[#f7f9f7]")}>
      <span className="relative shrink-0">
        <span className="grid size-10 place-items-center rounded-full bg-[#315f38] text-[11px] font-bold text-white">{initials(title) || "?"}</span>
        <ChannelIcon channel={conversation.channel} className="absolute -bottom-1 -right-1" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-[13px] text-[#232d26]", conversation.is_unread ? "font-bold" : "font-semibold")}>{title}</span>
          <time className={cn("shrink-0 text-[10px]", conversation.is_unread ? "font-semibold text-[#448349]" : "text-[#969e97]")}>{formatListTime(conversation.last_message_at, nowMs)}</time>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-xs", conversation.is_unread ? "font-medium text-[#3b463e]" : "text-[#7d867f]")}>{conversation.last_message_direction === "outbound" ? "You: " : ""}{conversation.last_message_preview ?? "No messages yet"}</span>
          {conversation.is_unread ? <span className="size-2 shrink-0 rounded-full bg-[#448349]" aria-label="Unread" /> : null}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {conversation.lead_status ? <Badge value={conversation.lead_status} className="px-2 py-0.5 text-[9px]" /> : !conversation.contact_id ? <span className="rounded-full bg-[#fff2d9] px-2 py-0.5 text-[9px] font-semibold text-[#9a641b]">New contact</span> : null}
          {conversation.status !== "open" ? <span className="rounded-full bg-[#f1f3f1] px-2 py-0.5 text-[9px] font-semibold text-[#69726b]">{titleCase(conversation.status)}</span> : null}
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-[10px] text-[#8b948c]"><UserRound className="size-3 shrink-0" />{conversation.assigned_to ? conversation.assigned_name ?? "Assigned" : "Unassigned"}</span>
        </span>
      </span>
    </Link>
  );
}

function Thread({ selected, messages, profile, profiles, canAssign, aiConfigured, nowMs, onOpenDetails }: InboxWorkspaceProps & { selected: ConversationSummary; onOpenDetails: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [lastMessageId]);
  const title = conversationTitle(selected);
  const run = (action: () => Promise<{ ok: boolean; message: string }>) => startTransition(async () => {
    const result = await action();
    if (!result.ok) { toast.error(result.message); router.refresh(); } else { toast.success(result.message); router.refresh(); }
  });
  let lastDay = "";

  return (
    <>
      <header className="flex items-center gap-3 border-b border-[#e4e9e4] px-3 py-2.5 sm:px-4">
        <Link href="/inbox" scroll={false} aria-label="Back to conversations" className="grid size-10 shrink-0 place-items-center rounded-lg text-[#59635c] hover:bg-[#f1f4f1] md:hidden"><ArrowLeft className="size-5" /></Link>
        <span className="relative hidden shrink-0 sm:block"><span className="grid size-10 place-items-center rounded-full bg-[#315f38] text-[11px] font-bold text-white">{initials(title) || "?"}</span><ChannelIcon channel={selected.channel} className="absolute -bottom-1 -right-1" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-[#1e2921]">{title}</h2>
          <p className="truncate text-[11px] text-[#7d867f]">{channelLabels[selected.channel]}{selected.external_handle ? ` · ${selected.external_handle}` : ""} · via {selected.account_name}</p>
        </div>
        {canAssign ? (
          <select aria-label="Assigned employee" disabled={pending} value={selected.assigned_to ?? ""} onChange={(event) => run(() => assignConversationAction(selected.id, event.target.value || null))} className="hidden h-9 max-w-[150px] rounded-lg border border-[#dce3dc] bg-white px-2 text-[11px] font-semibold text-[#4e5850] sm:block">
            <option value="">Unassigned</option>
            {profiles.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
          </select>
        ) : null}
        <select aria-label="Conversation status" disabled={pending} value={selected.status} onChange={(event) => run(() => setConversationStatusAction(selected.id, event.target.value as ConversationStatus))} className="h-9 rounded-lg border border-[#dce3dc] bg-white px-2 text-[11px] font-semibold text-[#4e5850]">
          <option value="open">Open</option><option value="pending">Pending</option><option value="closed">Closed</option>
        </select>
        <button type="button" onClick={onOpenDetails} aria-label="Open CRM details" className="grid size-10 shrink-0 place-items-center rounded-lg border border-[#e1e6e1] text-[#59635c] hover:bg-[#f7f9f7] xl:hidden"><PanelRight className="size-[18px]" /></button>
      </header>

      <div className="soft-scrollbar flex-1 space-y-2 overflow-y-auto bg-[#f7f8f6] px-3 py-4 sm:px-5" aria-live="polite">
        {messages.length ? messages.map((message) => {
          const at = message.sent_at ?? message.received_at ?? message.created_at;
          const day = new Date(at).toDateString();
          const showDay = day !== lastDay; lastDay = day;
          return <div key={message.id}>{showDay ? <p className="my-3 text-center text-[10px] font-semibold uppercase tracking-wider text-[#969e97]">{new Date(at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p> : null}<MessageBubble message={message} at={at} ownId={profile.id} /></div>;
        }) : <p className="py-16 text-center text-xs text-[#8b948c]">No messages in this conversation yet.</p>}
        <div ref={bottomRef} />
      </div>

      <Composer conversation={selected} aiConfigured={aiConfigured} nowMs={nowMs} />
    </>
  );
}

const statusIcons = { queued: Clock3, sent: Check, delivered: CheckCheck, read: CheckCheck, failed: AlertCircle } as const;

function MessageBubble({ message, at, ownId }: { message: InboxMessage; at: string; ownId: string }) {
  const outbound = message.direction === "outbound";
  const StatusIcon = outbound ? statusIcons[message.status as keyof typeof statusIcons] : undefined;
  const sender = outbound ? (message.sender_profile_id === ownId ? "You" : message.sender_name ?? "WWT") : null;
  if (message.message_type === "system") return <p className="mx-auto max-w-sm rounded-lg bg-[#eef1ee] px-3 py-1.5 text-center text-[11px] text-[#69736b]">{message.body}</p>;
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 shadow-[0_1px_2px_rgba(22,40,24,.06)] sm:max-w-[70%]", outbound ? "rounded-br-md bg-[#dcefdd] text-[#1f2a22]" : "rounded-bl-md border border-[#e4e9e4] bg-white text-[#28332b]", message.status === "failed" && "border border-[#e8c4b8] bg-[#fbeeea]")}>
        {message.attachments.map((attachment) => <Attachment key={attachment.id} attachment={attachment} />)}
        {message.body ? <p className={cn("whitespace-pre-wrap break-words text-sm leading-relaxed", message.message_type === "unsupported" && "italic text-[#7d867f]")} dir="auto">{message.body}</p> : null}
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#7d867f]">
          {sender ? <span className="mr-auto pr-3 font-medium">{sender}</span> : null}
          <time dateTime={at}>{new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</time>
          {StatusIcon ? <StatusIcon className={cn("size-3.5", message.status === "read" && "text-[#3f7fc4]", message.status === "failed" && "text-[#b04e34]")} aria-label={titleCase(message.status)} /> : null}
        </p>
        {message.status === "failed" ? <p className="mt-1 text-[11px] font-medium text-[#a04e35]">Not delivered{message.error_message ? `: ${message.error_message}` : "."}</p> : null}
      </div>
    </div>
  );
}

function Attachment({ attachment }: { attachment: InboxMessage["attachments"][number] }) {
  if (attachment.media_status === "pending") return <p className="mb-1 flex items-center gap-2 text-xs text-[#7d867f]"><LoaderCircle className="size-3.5 animate-spin" /> Receiving attachment…</p>;
  if (attachment.media_status === "failed") return <p className="mb-1 flex items-center gap-2 text-xs text-[#a04e35]"><AlertCircle className="size-3.5" /> Attachment could not be retrieved.</p>;
  const href = `/api/inbox/media/${attachment.id}`;
  if (attachment.mime_type?.startsWith("image/")) {
    // Served through a short-lived signed redirect, so next/image optimization does not apply.
    // eslint-disable-next-line @next/next/no-img-element
    return <a href={href} target="_blank" rel="noreferrer" className="mb-1 block"><img src={href} alt={attachment.file_name ?? "Image attachment"} loading="lazy" className="max-h-72 rounded-lg object-contain" /></a>;
  }
  if (attachment.mime_type?.startsWith("audio/")) return <audio controls preload="none" src={href} className="mb-1 h-10 w-60 max-w-full" />;
  if (attachment.mime_type?.startsWith("video/")) return <video controls preload="none" src={href} className="mb-1 max-h-72 rounded-lg" />;
  return <a href={href} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs font-medium text-[#315f38] hover:underline"><FileText className="size-4 shrink-0" /><span className="truncate">{attachment.file_name ?? "Attachment"}</span></a>;
}

function Composer({ conversation, aiConfigured, nowMs }: { conversation: ConversationSummary; aiConfigured: boolean; nowMs: number }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [aiDraft, setAiDraft] = useState(false);
  const [sending, startSending] = useTransition();
  const [drafting, startDrafting] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const replyState = replyWindow(conversation.channel, conversation.last_inbound_at, nowMs);
  const canAttach = conversation.channel === "whatsapp";

  const send = () => {
    const body = text.trim();
    if (!body || sending) return;
    startSending(async () => {
      const result = await sendMessageAction({ conversationId: conversation.id, text: body });
      if (!result.ok) toast.error(result.message); else { setText(""); setAiDraft(false); }
      router.refresh();
    });
  };
  const sendFile = (file: File) => startSending(async () => {
    const form = new FormData();
    form.set("conversationId", conversation.id); form.set("file", file); form.set("caption", text.trim());
    const result = await sendAttachmentAction(form);
    if (!result.ok) toast.error(result.message); else { setText(""); toast.success(result.message); }
    router.refresh();
  });
  const suggest = () => startDrafting(async () => {
    const result = await generateAiInsightAction(conversation.id, "suggested_reply");
    if (!result.ok) { toast.error(result.message); return; }
    const reply = typeof result.content.reply === "string" ? result.content.reply : "";
    if (reply) { setText(reply); setAiDraft(true); toast.message("Draft added to the composer. Review and edit it before sending."); }
  });

  if (!replyState.open) return <div className="border-t border-[#e4e9e4] bg-[#fffaf0] px-4 py-3 text-xs leading-5 text-[#8a5a17]" role="status"><strong className="font-semibold">Replies are paused.</strong> {replyState.reason}</div>;

  return (
    <div className="border-t border-[#e4e9e4] bg-white p-3">
      {aiDraft ? <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[#6b5a9a]"><Sparkles className="size-3.5" /> AI draft. Nothing is sent until you press Send.</p> : null}
      <div className="flex items-end gap-2">
        {canAttach ? <><input ref={fileRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) sendFile(file); }} /><button type="button" onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Attach a file" className="grid size-11 shrink-0 place-items-center rounded-lg text-[#667069] hover:bg-[#f1f4f1] disabled:opacity-60"><Paperclip className="size-[18px]" /></button></> : null}
        <textarea value={text} onChange={(event) => { setText(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} rows={Math.min(6, Math.max(1, text.split("\n").length))} dir="auto" placeholder={`Reply on ${channelLabels[conversation.channel]}...`} aria-label="Message" className="max-h-40 min-h-11 flex-1 resize-none rounded-lg border border-[#dce3dc] bg-[#fafbfa] px-3 py-2.5 text-sm text-[#28332b] placeholder:text-[#a0a7a1] focus:border-[#82a886] focus:ring-2 focus:ring-[#b9d8bc]/50" />
        {aiConfigured ? <button type="button" onClick={suggest} disabled={drafting || sending} title="Suggest a reply" aria-label="Suggest a reply with AI" className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dce3dc] text-[#6b5a9a] hover:bg-[#f6f3fb] disabled:opacity-60">{drafting ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}</button> : null}
        <button type="button" onClick={send} disabled={sending || !text.trim()} aria-label="Send message" className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#448349] text-white shadow-sm hover:bg-[#3a7745] disabled:cursor-not-allowed disabled:opacity-60">{sending ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}</button>
      </div>
    </div>
  );
}
