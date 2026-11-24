import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getOrCreateUserRecord,
  readCurrentUserOptional,
  requireIdentity,
  writeAuditLog,
} from "./authz";

export const listPublicAvailableTools = query({
  args: {},
  handler: async (ctx) => {
    const available = (await ctx.db
      .query("tools")
      .withIndex("by_status", (q) => q.eq("status", "available"))
      .collect()) as any[];

    return available
      .filter((tool) => !tool.isRemovedByAdmin)
      .map((tool) => ({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
      }));
  },
});

export const listAuthenticatedTools = query({
  args: {
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);

    const allTools = (await ctx.db.query("tools").collect()) as any[];
    const filtered = allTools.filter((tool) => {
      if (tool.isRemovedByAdmin) return false;
      if (args.category && args.category !== "all") {
        return String(tool.category ?? "").toLowerCase() === args.category.toLowerCase();
      }
      return true;
    });

    const users = (await ctx.db.query("users").collect()) as any[];
    const trustedSet = new Set(
      users.filter((u) => Boolean(u.trustedLender)).map((u) => u.clerkUserId)
    );

    return filtered.map((tool) => ({
      _id: tool._id,
      ownerUserId: tool.ownerUserId,
      name: tool.name,
      category: tool.category,
      condition: tool.condition,
      description: tool.description,
      status: tool.status,
      isTrustedLender: trustedSet.has(tool.ownerUserId),
      createdAt: tool.createdAt,
    }));
  },
});

export const getCurrentUserProfile = query({
  args: {},
  handler: async (ctx) => {
    return await readCurrentUserOptional(ctx);
  },
});

export const createTool = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actor = await getOrCreateUserRecord(ctx, {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    const name = args.name.trim();
    const category = args.category.trim().toLowerCase();
    const condition = args.condition.trim();
    const description = args.description.trim();

    if (!name || !category || !condition) {
      throw new Error("Name, category, and condition are required.");
    }

    const now = Date.now();
    const toolId = await ctx.db.insert("tools", {
      ownerUserId: identity.subject,
      name,
      category,
      condition,
      description,
      status: "available",
      isRemovedByAdmin: false,
      createdAt: now,
      updatedAt: now,
    } as any);

    await writeAuditLog(ctx, {
      actorUserId: identity.subject,
      actorRole: String(actor.role ?? "user"),
      action: "tool.created",
      resourceType: "tools",
      resourceId: String(toolId),
    });

    return toolId;
  },
});

export const updateOwnTool = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actor = await getOrCreateUserRecord(ctx, {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    const tool = (await ctx.db.get(args.toolId as any)) as any;
    if (!tool || tool.isRemovedByAdmin) {
      throw new Error("Tool not found.");
    }

    if (tool.ownerUserId !== identity.subject) {
      throw new Error("Forbidden: you can only edit your own tool listings.");
    }

    if (tool.status === "borrowed") {
      throw new Error("Cannot edit a tool while it is actively borrowed.");
    }

    await ctx.db.patch(args.toolId as any, {
      name: args.name.trim() || tool.name,
      category: args.category.trim().toLowerCase() || tool.category,
      condition: args.condition.trim() || tool.condition,
      description: args.description.trim(),
      updatedAt: Date.now(),
    } as any);

    await writeAuditLog(ctx, {
      actorUserId: identity.subject,
      actorRole: String(actor.role ?? "user"),
      action: "tool.updated",
      resourceType: "tools",
      resourceId: String(args.toolId),
    });
  },
});

export const deleteTool = mutation({
  args: {
    toolId: v.id("tools"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actor = await getOrCreateUserRecord(ctx, {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    const tool = (await ctx.db.get(args.toolId as any)) as any;
    if (!tool) {
      throw new Error("Tool not found.");
    }

    const isOwner = tool.ownerUserId === identity.subject;
    const isAdmin = actor.role === "admin";

    if (!isOwner && !isAdmin) {
      throw new Error("Forbidden: only the owner or an admin can remove this listing.");
    }

    if (tool.status === "borrowed" && !isAdmin) {
      throw new Error("Cannot delete a tool while it is currently borrowed.");
    }

    if (isAdmin && !isOwner) {
      await ctx.db.patch(args.toolId as any, {
        isRemovedByAdmin: true,
        status: "available",
        updatedAt: Date.now(),
      } as any);
      await writeAuditLog(ctx, {
        actorUserId: identity.subject,
        actorRole: String(actor.role ?? "user"),
        action: "admin.tool_removed",
        resourceType: "tools",
        resourceId: String(args.toolId),
      });
    } else {
      await ctx.db.delete(args.toolId as any);
      await writeAuditLog(ctx, {
        actorUserId: identity.subject,
        actorRole: String(actor.role ?? "user"),
        action: "tool.deleted",
        resourceType: "tools",
        resourceId: String(args.toolId),
      });
    }
  },
});

export const setTrustedLender = mutation({
  args: {
    targetUserId: v.string(),
    trustedLender: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const actor = await getOrCreateUserRecord(ctx, {
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    });

    if (actor.role !== "admin") {
      throw new Error("Forbidden: admin role required to update Trusted Lender status.");
    }

    const target = (await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", args.targetUserId))
      .unique()) as any;

    if (!target) {
      throw new Error("Target user not found.");
    }

    await ctx.db.patch(target._id as any, {
      trustedLender: args.trustedLender,
      updatedAt: Date.now(),
    } as any);

    await writeAuditLog(ctx, {
      actorUserId: identity.subject,
      actorRole: String(actor.role ?? "user"),
      action: "admin.set_trusted_lender",
      resourceType: "users",
      resourceId: String(target.clerkUserId),
    });
  },
});
