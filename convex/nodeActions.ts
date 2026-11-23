"use node";

import crypto from "crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const dispatchLoanWebhookToN8n = internalAction({
  args: {
    loanId: v.string(),
    toolName: v.string(),
    eventType: v.string(),
    status: v.string(),
    ownerUserId: v.string(),
    borrowerUserId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (_ctx, args) => {
    const webhookUrl = process.env.N8N_LOAN_WEBHOOK_URL;
    const secret = process.env.LENDLOOP_WEBHOOK_SECRET;

    if (!webhookUrl || !secret) {
      console.warn(
        "[LendLoop] N8N_LOAN_WEBHOOK_URL or LENDLOOP_WEBHOOK_SECRET not configured; skipping webhook."
      );
      return;
    }

    const timestamp = String(Date.now());
    const idempotencyKey = `${args.loanId}:${args.eventType}`;
    const payload = JSON.stringify({
      idempotencyKey,
      loanId: args.loanId,
      toolName: args.toolName,
      eventType: args.eventType,
      status: args.status,
      ownerUserId: args.ownerUserId,
      borrowerUserId: args.borrowerUserId,
      startDate: args.startDate,
      endDate: args.endDate,
      sentAt: timestamp,
    });

    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LendLoop-Timestamp": timestamp,
        "X-LendLoop-Signature": `sha256=${signature}`,
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`n8n webhook failed with status ${response.status}`);
    }
  },
});
