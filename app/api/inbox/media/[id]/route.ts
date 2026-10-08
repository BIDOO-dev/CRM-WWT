import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Redirects to a short-lived signed URL. RLS decides whether the employee may see the attachment. */
export async function GET(_request: Request, context: RouteContext<"/api/inbox/media/[id]">) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ message: "Invalid attachment." }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("message_attachments").select("storage_path").eq("id", id).maybeSingle();
  if (!data?.storage_path) return NextResponse.json({ message: "Attachment not found or not available yet." }, { status: 404 });
  const signed = await supabase.storage.from("inbox-media").createSignedUrl(data.storage_path, 300);
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ message: "Attachment could not be opened." }, { status: 404 });
  return NextResponse.redirect(signed.data.signedUrl);
}
