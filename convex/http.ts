import crypto from "crypto";
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";

const http = httpRouter();

function verifyHmacSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!timestampHeader || !signatureHeader) return false;
  const tsNum = Number(timestampHeader);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
    return false;
  }
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", secret)
      .update(`${timestampHeader}.${rawBody}`)
      .digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

http.route({
  path: "/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.LENDLOOP_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Server misconfigured", { status: 500 });
    }
    const ts = request.headers.get("x-lendloop-timestamp");
    const sig = request.headers.get("x-lendloop-signature");
    if (!verifyHmacSignature("", ts, sig, secret)) {
      return new Response("Invalid signature", { status: 401 });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const loans = await ctx.runQuery(internal.loans.getOverdueLoansInternal, {
      todayIso,
    });

    return new Response(JSON.stringify({ todayIso, loans }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/n8n/writeback",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.LENDLOOP_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("Server misconfigured", { status: 500 });
    }
    const rawBody = await request.text();
    const ts = request.headers.get("x-lendloop-timestamp");
    const sig = request.headers.get("x-lendloop-signature");
    if (!verifyHmacSignature(rawBody, ts, sig, secret)) {
      return new Response("Invalid signature", { status: 401 });
    }

    const body = JSON.parse(rawBody) as {
      idempotencyKey: string;
      loanId: string;
      workflowType: "request_notification" | "overdue_reminder";
      eventType: string;
      summary: string;
    };

    const result = await ctx.runMutation(
      internal.loans.recordN8nWritebackInternal,
      {
        idempotencyKey: body.idempotencyKey,
        loanId: body.loanId as Id<"loans">,
        workflowType: body.workflowType,
        eventType: body.eventType,
        summary: body.summary,
      }
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
