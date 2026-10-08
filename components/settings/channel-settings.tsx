"use client";

import { Check, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { syncWhatsAppNumbersAction, updateChannelAccountAction } from "@/app/actions/inbox";
import { ChannelIcon } from "@/components/inbox/inbox-ui";
import { Button, selectClass } from "@/components/ui/primitives";
import { channelLabels, type ChannelAccount, type ChannelKind } from "@/lib/inbox/types";
import type { Profile } from "@/lib/types";

type ChannelRow = { kind: ChannelKind; label: string; is_enabled: boolean; notes: string | null; missing: string[] | null };

export function ChannelSettings({ channels, accounts, profiles, webhookUrl, canSyncWhatsApp, canEdit }: { channels: ChannelRow[]; accounts: ChannelAccount[]; profiles: Profile[]; webhookUrl: string; canSyncWhatsApp: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  return (
    <div className="divide-y divide-[#edf0ed]">
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {channels.map((channel) => {
          const ready = channel.missing !== null && channel.missing.length === 0;
          return (
            <div key={channel.kind} className="rounded-lg border border-[#e1e6e1] p-3">
              <div className="flex items-center gap-2"><ChannelIcon channel={channel.kind} className="size-6 ring-0" /><span className="flex-1 text-xs font-semibold text-[#303c33]">{channel.label}</span><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${channel.is_enabled && ready ? "bg-[#e8f3e9] text-[#34703b]" : "bg-[#eef2ee] text-[#607363]"}`}>{channel.missing === null ? "Not available" : !channel.is_enabled ? "Prepared" : ready ? "Connected" : "Needs setup"}</span></div>
              <p className="mt-2 text-[11px] leading-5 text-[#7b857d]">{channel.notes}</p>
              {channel.missing?.length ? <p className="mt-2 flex gap-1.5 text-[11px] leading-5 text-[#9a641b]"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span>Missing server settings: <span className="font-mono text-[10px]">{channel.missing.join(", ")}</span></span></p> : null}
            </div>
          );
        })}
      </div>
      <div className="space-y-2 p-5">
        <p className="text-[11px] font-semibold text-[#4a554c]">Meta webhook callback URL</p>
        <code className="block overflow-x-auto rounded-lg bg-[#f4f6f4] px-3 py-2 font-mono text-[11px] text-[#39463c]">{webhookUrl}</code>
        <p className="text-[10px] leading-5 text-[#8b948c]">Use this URL and your verify token in the Meta app dashboard for each product. Access tokens are never stored in the CRM database or shown here.</p>
      </div>
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold text-[#303c33]">Connected numbers and accounts</p><p className="mt-0.5 text-[10px] text-[#8b948c]">Automatic lead creation is off unless you enable it for an account.</p></div>
          {canEdit && canSyncWhatsApp ? <Button variant="secondary" disabled={syncing} onClick={() => startSync(async () => { const result = await syncWhatsAppNumbersAction(); if (!result.ok) toast.error(result.message); else { toast.success(result.message); router.refresh(); } })}>{syncing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync WhatsApp numbers</Button> : null}
        </div>
        {accounts.length ? <div className="space-y-3">{accounts.map((account) => <AccountRow key={account.id} account={account} profiles={profiles} canEdit={canEdit} />)}</div> : <p className="rounded-lg bg-[#f7f9f7] px-3 py-4 text-center text-[11px] text-[#8b948c]">No accounts yet. A number is registered automatically when its first message arrives, or when you sync after adding the WhatsApp settings.</p>}
      </div>
    </div>
  );
}

function AccountRow({ account, profiles, canEdit }: { account: ChannelAccount; profiles: Profile[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [autoCreate, setAutoCreate] = useState(account.auto_create_leads);
  const [assignee, setAssignee] = useState(account.default_assignee_id ?? "");
  const [active, setActive] = useState(account.is_active);
  const dirty = autoCreate !== account.auto_create_leads || assignee !== (account.default_assignee_id ?? "") || active !== account.is_active;
  return (
    <div className="rounded-lg border border-[#e1e6e1] p-3">
      <div className="flex items-center gap-2"><ChannelIcon channel={account.channel} className="size-6 ring-0" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#303c33]">{account.display_name}</p><p className="text-[10px] text-[#8b948c]">{channelLabels[account.channel]}{account.display_identifier ? ` · ${account.display_identifier}` : ""}</p></div></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="block"><span className="mb-1 block text-[10px] font-semibold text-[#4a554c]">Default salesperson for new senders</span><select disabled={!canEdit} value={assignee} onChange={(event) => setAssignee(event.target.value)} className={`${selectClass} h-10`}><option value="">Leave unassigned (manager queue)</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>
        <label className="flex min-h-10 items-center gap-2 text-[11px] font-medium text-[#4e5850]"><input type="checkbox" disabled={!canEdit} checked={autoCreate} onChange={(event) => setAutoCreate(event.target.checked)} className="size-4 accent-[#448349]" /> Create leads automatically</label>
        <label className="flex min-h-10 items-center gap-2 text-[11px] font-medium text-[#4e5850]"><input type="checkbox" disabled={!canEdit} checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-[#448349]" /> Active</label>
        {canEdit ? <Button disabled={pending || !dirty} onClick={() => startTransition(async () => { const result = await updateChannelAccountAction(account.id, { auto_create_leads: autoCreate, default_assignee_id: assignee, is_active: active }); if (!result.ok) toast.error(result.message); else { toast.success(result.message); router.refresh(); } })}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Save</Button> : null}
      </div>
    </div>
  );
}
