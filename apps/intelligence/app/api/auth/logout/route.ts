import { NextResponse } from "next/server";
import { REAUTH_COOKIE, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const clear = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 };
  response.cookies.set(SESSION_COOKIE, "", clear);
  response.cookies.set(REAUTH_COOKIE, "", clear);
  return response;
}
