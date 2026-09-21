import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const entities = {
  "site-visits": { recordTable: "site_visits", fileTable: "site_visit_files", foreignKey: "site_visit_id" },
  quotes: { recordTable: "quotations", fileTable: "quotation_files", foreignKey: "quotation_id" },
  tenders: { recordTable: "tenders", fileTable: "tender_files", foreignKey: "tender_id" },
} as const;

const allowedTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/dwg", "application/dxf", "text/plain",
]);

function safeFileName(value: string) {
  return value.normalize("NFKC").replace(/[^a-zA-Z0-9._ -]/g, "").replace(/\s+/g, "-").slice(0, 120) || "file";
}

export async function POST(request: Request, context: { params: Promise<{ entity: string; id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { entity, id } = await context.params;
  const config = entities[entity as keyof typeof entities];
  if (!config || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ message: "Invalid upload target." }, { status: 400 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Choose a file to upload." }, { status: 400 });
  if (!file.size || file.size > 15 * 1024 * 1024) return NextResponse.json({ message: "Files must be between 1 byte and 15 MB." }, { status: 400 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ message: "This file type is not allowed." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const accessible = await supabase.from(config.recordTable).select("id").eq("id", id).maybeSingle();
  if (accessible.error || !accessible.data) return NextResponse.json({ message: "Record not found or access denied." }, { status: 404 });
  const name = safeFileName(file.name);
  const storagePath = `${entity}/${id}/${crypto.randomUUID()}-${name}`;
  const uploaded = await supabase.storage.from("crm-files").upload(storagePath, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (uploaded.error) return NextResponse.json({ message: "The file could not be stored." }, { status: 400 });
  const metadata = await supabase.from(config.fileTable).insert({ [config.foreignKey]: id, storage_path: storagePath, file_name: file.name.slice(0, 240), mime_type: file.type, size_bytes: file.size, uploaded_by: profile.id }).select("id").single();
  if (metadata.error) {
    await supabase.storage.from("crm-files").remove([storagePath]);
    return NextResponse.json({ message: "The upload could not be linked to this record." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: metadata.data.id });
}
