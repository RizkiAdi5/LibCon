import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";
import { runReminders } from "@/lib/reminders";

/** FR-10.05: Vercel Cron harian 00.00 UTC = 07.00 WIB (vercel.json). Header `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ?now= hanya di development untuk menguji jadwal H-n tanpa menunggu tanggalnya
  const nowParam = process.env.NODE_ENV === "development" ? new URL(request.url).searchParams.get("now") : null;
  const now = nowParam ? new Date(nowParam) : new Date();
  const sent = await runWithRequestContext(
    { userId: SYSTEM_USER_ID, requestId: randomUUID(), ip: null, userAgent: null, source: "CRON" },
    () => runReminders(SYSTEM_USER_ID, now),
  );
  return NextResponse.json(sent);
}
