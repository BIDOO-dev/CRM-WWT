import { Camera, MessageCircle, MessagesSquare, Music2, X } from "lucide-react";
import type { ReactNode } from "react";
import { channelLabels, type ChannelKind } from "@/lib/inbox/types";
import { cn } from "@/lib/utils";

const channelStyles: Record<ChannelKind, { icon: typeof MessageCircle; className: string }> = {
  whatsapp: { icon: MessageCircle, className: "bg-[#e3f3e6] text-[#2f7d3b]" },
  instagram: { icon: Camera, className: "bg-[#f8e9f0] text-[#a8456f]" },
  messenger: { icon: MessagesSquare, className: "bg-[#e8eefa] text-[#3f63ad]" },
  tiktok: { icon: Music2, className: "bg-[#eef0ef] text-[#48524b]" },
};

export function ChannelIcon({ channel, className }: { channel: ChannelKind; className?: string }) {
  const { icon: Icon, className: tone } = channelStyles[channel];
  return <span title={channelLabels[channel]} aria-label={channelLabels[channel]} className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-2 ring-white", tone, className)}><Icon className="size-3" strokeWidth={2.2} /></span>;
}

export function Drawer({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-[#172019]/35 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn("max-h-[92dvh] w-full overflow-auto bg-white shadow-2xl sm:rounded-xl", wide ? "sm:max-w-4xl" : "sm:max-w-lg")}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e7ebe7] bg-white px-5 py-4">
          <h3 className="text-sm font-semibold text-[#29352c]">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-[#818a83] hover:bg-[#f1f4f1]"><X className="size-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function formatListTime(value: string | null | undefined, nowMs: number) {
  if (!value) return "";
  const date = new Date(value);
  const sameDay = new Date(nowMs).toDateString() === date.toDateString();
  if (sameDay) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (nowMs - date.getTime() < 6 * 86400000) return date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
