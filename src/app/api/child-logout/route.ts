import { NextResponse } from "next/server";
import { CHILD_SESSION_COOKIE } from "@/lib/child-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(CHILD_SESSION_COOKIE);
  return response;
}
