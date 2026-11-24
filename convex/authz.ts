import { MutationCtx, QueryCtx } from "./_generated/server";

export async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized: sign in required.");
  }
  return identity;
}

export async function getOrCreateUserRecord(
  ctx: MutationCtx,
  identity: {
    subject: string;
    email?: string;
    name?: string;
  }
) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();

  const adminIdsRaw = process.env.LENDLOOP_ADMIN_CLERK_IDS || "";
  const configuredAdmins = new Set(
    adminIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const shouldBeAdmin = configuredAdmins.has(identity.subject);
  const now = Date.now();

  if (existing) {
    const nextRole = shouldBeAdmin ? "admin" : existing.role;
    if (
      existing.role !== nextRole ||
      (identity.email && existing.email !== identity.email) ||
      (identity.name && existing.name !== identity.name)
    ) {
      await ctx.db.patch(existing._id as any, {
        role: nextRole,
        email: identity.email ?? existing.email,
        name: identity.name ?? existing.name,
        updatedAt: now,
      });
    }
    return { ...existing, role: nextRole };
  }

  const initialRole: "admin" | "user" = shouldBeAdmin ? "admin" : "user";
  const id = await ctx.db.insert("users", {
    clerkUserId: identity.subject,
    email: identity.email,
    name: identity.name,
    role: initialRole,
    trustedLender: false,
    createdAt: now,
    updatedAt: now,
  });

  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to initialize user record.");
  }
  return created;
}

export async function readCurrentUserOptional(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

export async function writeAuditLog(
  ctx: MutationCtx,
  params: {
    actorUserId: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string;
  }
) {
  await ctx.db.insert("auditLogs", {
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    createdAt: Date.now(),
  });
}
