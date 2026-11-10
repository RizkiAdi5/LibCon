import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runWithRequestContext } from "@/lib/db/requestContext";
import { SYSTEM_USER_ID } from "@/lib/auth/constants";
import { runPeriodTransitions } from "@/lib/periodTransitions";

/** Vercel Cron memanggil GET dengan header `Authorization: Bearer $CRON_SECRET` (lihat vercel.json). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runWithRequestContext(
    { userId: SYSTEM_USER_ID, requestId: randomUUID(), ip: null, userAgent: null, source: "CRON" },
    () => runPeriodTransitions(),
  );
  return NextResponse.json(result);
}
