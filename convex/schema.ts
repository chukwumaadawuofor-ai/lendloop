import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    trustedLender: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_role", ["role"]),

  tools: defineTable({
    ownerUserId: v.string(),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("available"),
      v.literal("requested"),
      v.literal("borrowed")
    ),
    isRemovedByAdmin: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerUserId"])
    .index("by_status", ["status"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    toolName: v.string(),
    ownerUserId: v.string(),
    borrowerUserId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("returned")
    ),
    lastNotificationEvent: v.optional(v.string()),
    lastNotificationAt: v.optional(v.number()),
    lastReminderSentAt: v.optional(v.number()),
    reminderCount: v.number(),
    lastIdempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tool", ["toolId"])
    .index("by_owner", ["ownerUserId"])
    .index("by_borrower", ["borrowerUserId"])
    .index("by_status_and_end_date", ["status", "endDate"]),

  automationLogs: defineTable({
    idempotencyKey: v.string(),
    loanId: v.id("loans"),
    workflowType: v.union(
      v.literal("request_notification"),
      v.literal("overdue_reminder")
    ),
    eventType: v.string(),
    summary: v.string(),
    createdAt: v.number(),
  }).index("by_idempotency_key", ["idempotencyKey"]),

  auditLogs: defineTable({
    actorUserId: v.string(),
    actorRole: v.string(),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    createdAt: v.number(),
  }).index("by_actor", ["actorUserId"]),
});
