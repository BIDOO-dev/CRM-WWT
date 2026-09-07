"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SearchResult = { type: string; label: string; detail: string; href: string };

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) { setResults([]); return; }
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (response.ok) setResults(await response.json());
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={rootRef} className="relative hidden w-full max-w-[340px] md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#929a93]" />
      <input value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-label="Search CRM" className="h-10 w-full rounded-lg border border-[#dfe5df] bg-[#fafbfa] pl-9 pr-12 text-xs text-[#263029] placeholder:text-[#9ba29c] focus:border-[#82a886] focus:bg-white focus:ring-2 focus:ring-[#b9d8bc]/50" placeholder="Search contacts, phones, leads..." />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[#dfe5df] bg-white px-1.5 py-0.5 text-[9px] text-[#8b938c]">⌘ K</kbd>
      {open && query.trim().length >= 2 ? <div className="absolute right-0 top-12 z-50 w-[420px] max-w-[80vw] overflow-hidden rounded-xl border border-[#dce3dc] bg-white shadow-[0_18px_55px_rgba(31,48,34,.16)]"><div className="border-b border-[#edf0ed] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#929a93]">Search results</div>{results.length ? <div className="max-h-80 overflow-auto p-1.5">{results.map((result) => <Link key={`${result.type}-${result.href}`} href={result.href} onClick={() => { setOpen(false); setQuery(""); }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[#f3f6f3]"><span className="w-[74px] text-[9px] font-bold uppercase tracking-wide text-[#448349]">{result.type}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#2e3931]">{result.label}</span><span className="block truncate text-[10px] text-[#879088]">{result.detail}</span></span></Link>)}</div> : <p className="px-4 py-8 text-center text-xs text-[#89918a]">No matching CRM records.</p>}</div> : null}
    </div>
  );
}
