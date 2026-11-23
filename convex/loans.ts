import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getOrCreateUserRecord, requireIdentity, writeAuditLog } from "./authz";

export const listMyLoansAndRequests = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const me = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
      .unique();

    const borrowerLoans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerUserId", identity.subject))
      .collect();

    const incomingRequests = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", identity.subject))
      .collect();

    const allLoans =
      me?.role === "admin" ? await ctx.db.query("loans").collect() : [];

    return {
      isAdmin: me?.role === "admin",
      borrowerLoans,
      incomingRequests,
      allLoans,
    };
  },
});

export const requestBorrowTool = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actor = await getOrCreateUserRecord(ctx, {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.isRemovedByAdmin) {
      throw new Error("Tool not found.");
    }

    if (tool.ownerUserId === identity.subject) {
      throw new Error("You cannot request to borrow your own tool.");
    }

    if (tool.status !== "available") {
      throw new Error("Tool is not currently available for borrowing.");
    }

    if (!args.startDate || !args.endDate || args.endDate < args.startDate) {
      throw new Error("Please provide a valid date range (endDate >= startDate).");
    }

    const now = Date.now();
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      toolName: tool.name,
      ownerUserId: tool.ownerUserId,
      borrowerUserId: identity.subject,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
      reminderCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(tool._id, {
      status: "requested",
      updatedAt: now,
    });

    await writeAuditLog(ctx, {
      actorUserId: identity.subject,
      actorRole: actor.role,
      action: "loan.requested",
      resourceType: "loans",
      resourceId: String(loanId),
    });

    await ctx.scheduler.runAfter(0, internal.nodeActions.dispatchLoanWebhookToN8n, {
      loanId: String(loanId),
      toolName: tool.name,
      eventType: "request_created",
      status: "pending",
      ownerUserId: tool.ownerUserId,
      borrowerUserId: identity.subject,
      startDate: args.startDate,
      endDate: args.endDate,
    });

    return loanId;
  },
});

export const respondToLoanRequest = mutation({
  args: {
    loanId: v.id("loans"),
    decision: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actor = await getOrCreateUserRecord(ctx, {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new Error("Loan request not found.");
    }

    if (loan.ownerUserId !== identity.subject) {
      throw new Error("Forbidden: only the tool owner can approve or decline this request.");
    }

    if (loan.status !== "pending") {
      throw new Error("Only pending loan requests can be approved or declined.");
    }

    const tool = await ctx.db.get(loan.toolId);
    const now = Date.now();

    await ctx.db.patch(loan._id, {
      status: args.decision,
      updatedAt: now,
    });

    if (tool && !tool.isRemovedByAdmin) {
      await ctx.db.patch(tool._id, {
        status: args.decision === "approved" ? "borrowed" : "available",
        updatedAt: now,
      });
    }

    await writeAuditLog(ctx, {
      actorUserId: identity.subject,
      actorRole: actor.role,
      action: `loan.${args.decision}`,
      resourceType: "loans",
      resourceId: String(loan._id),
    });

    await ctx.scheduler.runAfter(0, internal.nodeActions.dispatchLoanWebhookToN8n, {
      loanId: String(loan._id),
      toolName: loan.toolName,
      eventType: `request_${args.decision}`,
      status: args.decision,
      ownerUserId: loan.ownerUserId,
      borrowerUserId: loan.borrowerUserId,
      startDate: loan.startDate,
      endDate: loan.endDate,
    });
  },
});

export const markLoanReturned = mutation({
  args: {
    loanId: v.id("loans"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actor = await getOrCreateUserRecord(ctx, {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new Error("Loan record not found.");
    }

    const isInvolved =
      loan.ownerUserId === identity.subject ||
      loan.borrowerUserId === identity.subject;
    if (!isInvolved) {
      throw new Error("Forbidden: you are not part of this loan.");
    }

    if (loan.status !== "approved") {
      throw new Error("Only approved/active loans can be marked returned.");
    }

    const tool = await ctx.db.get(loan.toolId);
    const now = Date.now();

    await ctx.db.patch(loan._id, {
      status: "returned",
      updatedAt: now,
    });

    if (tool && !tool.isRemovedByAdmin) {
      await ctx.db.patch(tool._id, {
        status: "available",
        updatedAt: now,
      });
    }

    await writeAuditLog(ctx, {
      actorUserId: identity.subject,
      actorRole: actor.role,
      action: "loan.returned",
      resourceType: "loans",
      resourceId: String(loan._id),
    });

    await ctx.scheduler.runAfter(0, internal.nodeActions.dispatchLoanWebhookToN8n, {
      loanId: String(loan._id),
      toolName: loan.toolName,
      eventType: "loan_returned",
      status: "returned",
      ownerUserId: loan.ownerUserId,
      borrowerUserId: loan.borrowerUserId,
      startDate: loan.startDate,
      endDate: loan.endDate,
    });
  },
});

export const getOverdueLoansInternal = internalQuery({
  args: { todayIso: v.string() },
  handler: async (ctx, args) => {
    const approvedLoans = await ctx.db
      .query("loans")
      .withIndex("by_status_and_end_date", (q) => q.eq("status", "approved"))
      .collect();

    return approvedLoans
      .filter((loan) => loan.endDate < args.todayIso)
      .map((loan) => ({
        loanId: String(loan._id),
        toolName: loan.toolName,
        borrowerUserId: loan.borrowerUserId,
        endDate: loan.endDate,
        reminderCount: loan.reminderCount,
        lastReminderSentAt: loan.lastReminderSentAt ?? null,
      }));
  },
});

export const recordN8nWritebackInternal = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.id("loans"),
    workflowType: v.union(
      v.literal("request_notification"),
      v.literal("overdue_reminder")
    ),
    eventType: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const existingLog = await ctx.db
      .query("automationLogs")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .unique();

    if (existingLog) {
      return { deduped: true, idempotencyKey: args.idempotencyKey };
    }

    const loan = await ctx.db.get(args.loanId);
    if (!loan) {
      throw new Error("Loan not found for write-back.");
    }

    const now = Date.now();
    await ctx.db.insert("automationLogs", {
      idempotencyKey: args.idempotencyKey,
      loanId: args.loanId,
      workflowType: args.workflowType,
      eventType: args.eventType,
      summary: args.summary,
      createdAt: now,
    });

    if (args.workflowType === "overdue_reminder") {
      await ctx.db.patch(loan._id, {
        lastReminderSentAt: now,
        reminderCount: loan.reminderCount + 1,
        lastIdempotencyKey: args.idempotencyKey,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(loan._id, {
        lastNotificationEvent: args.eventType,
        lastNotificationAt: now,
        lastIdempotencyKey: args.idempotencyKey,
        updatedAt: now,
      });
    }

    return { deduped: false, idempotencyKey: args.idempotencyKey };
  },
});
