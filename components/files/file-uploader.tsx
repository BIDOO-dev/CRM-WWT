"use client";

import { Download, FileUp, LoaderCircle, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/primitives";
import type { CrmFile } from "@/lib/types";

export function FileUploader({ entity, recordId, files }: { entity: "site-visits" | "quotes" | "tenders"; recordId: string; files: CrmFile[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    const body = new FormData(); body.set("file", file);
    try {
      const response = await fetch(`/api/files/${entity}/${recordId}`, { method: "POST", body });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Upload failed.");
      toast.success("File uploaded."); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed."); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }
  return <div>
    <div className="flex items-center justify-between gap-3 border-b border-[#edf0ed] px-5 py-4"><div><h3 className="text-sm font-semibold text-[#2e3931]">Files</h3><p className="mt-0.5 text-[10px] text-[#8b948c]">Private, authenticated downloads</p></div><input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /><Button variant="secondary" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />} Upload</Button></div>
    {files.length ? <div className="divide-y divide-[#edf0ed]">{files.map((file) => <a key={file.id} href={file.download_url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafbfa]"><span className="grid size-8 place-items-center rounded-lg bg-[#edf4ed] text-[#448349]"><Paperclip className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#38443b]">{file.file_name}</span><span className="text-[9px] text-[#8b948c]">{file.size_bytes ? `${Math.max(1, Math.round(file.size_bytes / 1024))} KB` : "File"}</span></span><Download className="size-4 text-[#7e8980]" /></a>)}</div> : <p className="px-5 py-6 text-center text-xs text-[#89918a]">No files uploaded.</p>}
  </div>;
}
