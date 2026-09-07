import { NextResponse } from "next/server";
import { searchCrm } from "@/lib/data";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < 2) return NextResponse.json([]);
  try {
    return NextResponse.json(await searchCrm(query));
  } catch (error) {
    console.error("CRM search failed", error);
    return NextResponse.json({ message: "Search is temporarily unavailable." }, { status: 500 });
  }
}
