import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#e8f1e8] text-[#448349]"><SearchX className="size-6" /></span><h1 className="mt-5 text-2xl font-semibold tracking-[-.035em] text-[#1f2a22]">Record not found</h1><p className="mt-2 text-sm text-[#788179]">The CRM record may have moved, been removed, or is outside your access.</p><Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-lg bg-[#448349] px-4 text-xs font-semibold text-white">Back to dashboard</Link></div></main>;
}
