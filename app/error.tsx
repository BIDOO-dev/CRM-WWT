"use client";

import { CircleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-[70vh] place-items-center p-6 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-xl bg-[#f7eae6] text-[#ae563b]"><CircleAlert className="size-6" /></span><h2 className="mt-5 text-xl font-semibold text-[#263129]">We couldn’t load this view</h2><p className="mt-2 text-sm text-[#788179]">Your data is safe. Try the request again in a moment.</p><button onClick={reset} className="mt-6 h-10 rounded-lg bg-[#448349] px-4 text-xs font-semibold text-white">Try again</button></div></main>;
}
