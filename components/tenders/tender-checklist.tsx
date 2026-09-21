"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleTenderChecklistAction } from "@/app/actions/phase2";
import type { TenderChecklistItem } from "@/lib/types";

export function TenderChecklist({ initial }: { initial: TenderChecklistItem[] }) { const router = useRouter(); const [rows, setRows] = useState(initial); const [, startTransition] = useTransition(); return <div className="divide-y divide-[#edf0ed]">{rows.map((item) => <button key={item.id} type="button" onClick={() => { const completed = !item.is_completed; setRows((items) => items.map((row) => row.id === item.id ? { ...row, is_completed: completed } : row)); startTransition(async () => { const result = await toggleTenderChecklistAction(item.id, completed); if (!result.ok) { setRows((items) => items.map((row) => row.id === item.id ? item : row)); toast.error(result.message); } else { toast.success(result.message); router.refresh(); } }); }} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[#fafbfa]"><span className={`grid size-5 place-items-center rounded border-2 ${item.is_completed ? "border-[#448349] bg-[#448349] text-white" : "border-[#aab3ac] text-transparent"}`}><Check className="size-3" /></span><span className={`text-xs font-medium ${item.is_completed ? "text-[#89918a] line-through" : "text-[#39463c]"}`}>{item.label}</span></button>)}</div>; }
