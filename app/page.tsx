"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Show,
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { Id } from "@/convex/_generated/dataModel";

type TabKey = "browse" | "my-listings" | "my-requests" | "incoming";

function LendLoopBoard() {
  const { isSignedIn } = useAuth();

  const [tab, setTab] = useState<TabKey>("browse");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [name, setName] = useState("");
  const [category, setCategory] = useState("power tools");
  const [condition, setCondition] = useState("Good");
  const [description, setDescription] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [borrowDates, setBorrowDates] = useState<
    Record<string, { startDate: string; endDate: string }>
  >({});

  const publicTools = useQuery(api.tools.listPublicAvailableTools);
  const profile = useQuery(
    api.tools.getCurrentUserProfile,
    isSignedIn ? {} : "skip"
  );
  const authTools = useQuery(
    api.tools.listAuthenticatedTools,
    isSignedIn ? { category: categoryFilter } : "skip"
  );
  const loansBundle = useQuery(
    api.loans.listMyLoansAndRequests,
    isSignedIn ? {} : "skip"
  );

  const createTool = useMutation(api.tools.createTool);
  const deleteTool = useMutation(api.tools.deleteTool);
  const setTrustedLender = useMutation(api.tools.setTrustedLender);
  const requestBorrowTool = useMutation(api.loans.requestBorrowTool);
  const respondToLoanRequest = useMutation(api.loans.respondToLoanRequest);
  const markLoanReturned = useMutation(api.loans.markLoanReturned);

  const categories = useMemo(
    () => ["all", "power tools", "garden", "kitchen", "camping"],
    []
  );

  function switchTab(nextTab: TabKey) {
    setStatusMsg(null);
    setErrorMsg(null);
    setTab(nextTab);
  }

  async function handleCreateTool(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg("Please enter a tool name.");
      return;
    }
    try {
      await createTool({
        name: trimmedName,
        category,
        condition: condition.trim() || "Good",
        description: description.trim(),
      });
      setName("");
      setDescription("");
      setStatusMsg("Tool listed on LendLoop.");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to list tool.");
    }
  }

  async function handleRequestBorrow(toolId: Id<"tools">) {
    setErrorMsg(null);
    setStatusMsg(null);
    const dates = borrowDates[String(toolId)] || {
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    };
    try {
      await requestBorrowTool({
        toolId,
        startDate: dates.startDate,
        endDate: dates.endDate,
      });
      setStatusMsg("Borrow request submitted.");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to submit borrow request."
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            LendLoop
          </h1>
          <p className="text-sm text-slate-400">
            Borrow what you need. Lend what you don’t.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Sign in to lend or borrow
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            {profile && (
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200">
                Role: {profile.role}
                {profile.trustedLender ? " · Trusted Lender" : ""}
              </span>
            )}
            <UserButton />
          </Show>
        </div>
      </header>

      {statusMsg && (
        <div className="mb-4 rounded-lg border border-emerald-700/60 bg-emerald-950/60 px-4 py-2.5 text-sm text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 rounded-lg border border-rose-700/60 bg-rose-950/60 px-4 py-2.5 text-sm text-rose-200">
          {errorMsg}
        </div>
      )}

      <Show when="signed-out">
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="mb-1 text-lg font-semibold text-white">
            Available Neighborhood Tools
          </h2>
          <p className="mb-5 text-xs text-slate-400">
            Sign in to view tool details, request loans, manage listings, and
            track automation reminders.
          </p>

          {!publicTools ? (
            <p className="text-sm text-slate-400">Loading available tools...</p>
          ) : publicTools.length === 0 ? (
            <p className="text-sm text-slate-400">
              No tools currently available.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {publicTools.map((tool: any) => (
                <div
                  key={tool._id}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-4"
                >
                  <div className="font-medium text-white">{tool.name}</div>
                  <div className="mt-1 inline-block rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {tool.category}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </Show>

      <Show when="signed-in">
        <nav className="mb-6 flex flex-wrap gap-2">
          {(
            [
              ["browse", "All Tools"],
              ["my-listings", "My Listings"],
              ["my-requests", "My Requests"],
              ["incoming", "Incoming Requests"],
            ] as [TabKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium ${
                tab === key
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "browse" && (
          <div className="grid gap-8 lg:grid-cols-3">
            <form
              onSubmit={handleCreateTool}
              className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-5"
            >
              <h2 className="text-base font-semibold text-white">List a Tool</h2>
              <input
                required
                placeholder="Tool name (e.g., Cordless Drill)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="power tools">power tools</option>
                <option value="garden">garden</option>
                <option value="kitchen">kitchen</option>
                <option value="camping">camping</option>
              </select>
              <input
                required
                placeholder="Condition (e.g., Like new, Good)"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <textarea
                placeholder="Short description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Publish Listing
              </button>
            </form>

            <div className="space-y-4 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                      categoryFilter === cat
                        ? "bg-slate-100 text-slate-950"
                        : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {(authTools || []).map((tool: any) => {
                  const isOwner = profile?.clerkUserId === tool.ownerUserId;
                  const isAdmin = profile?.role === "admin";
                  const dates = borrowDates[String(tool._id)] || {
                    startDate: new Date().toISOString().slice(0, 10),
                    endDate: new Date(Date.now() + 3 * 86400000)
                      .toISOString()
                      .slice(0, 10),
                  };

                  return (
                    <div
                      key={tool._id}
                      className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-white">
                            {tool.name}
                          </h3>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs capitalize text-emerald-300">
                            {tool.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {tool.category} · Condition: {tool.condition}
                          {tool.isTrustedLender ? " · Trusted Lender" : ""}
                        </p>
                        {tool.description && (
                          <p className="mt-2 text-sm text-slate-300">
                            {tool.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                        {!isOwner && tool.status === "available" && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <input
                                type="date"
                                value={dates.startDate}
                                onChange={(e) =>
                                  setBorrowDates((prev) => ({
                                    ...prev,
                                    [String(tool._id)]: {
                                      ...dates,
                                      startDate: e.target.value,
                                    },
                                  }))
                                }
                                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                              />
                              <input
                                type="date"
                                value={dates.endDate}
                                onChange={(e) =>
                                  setBorrowDates((prev) => ({
                                    ...prev,
                                    [String(tool._id)]: {
                                      ...dates,
                                      endDate: e.target.value,
                                    },
                                  }))
                                }
                                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRequestBorrow(tool._id)}
                              className="w-full rounded-lg bg-emerald-500/90 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                            >
                              Request to Borrow
                            </button>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {(isOwner || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => deleteTool({ toolId: tool._id })}
                              className="rounded bg-rose-950 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-900"
                            >
                              {isAdmin && !isOwner
                                ? "Admin Remove"
                                : "Delete Listing"}
                            </button>
                          )}
                          {isAdmin && !tool.isTrustedLender && (
                            <button
                              type="button"
                              onClick={() =>
                                setTrustedLender({
                                  targetUserId: tool.ownerUserId,
                                  trustedLender: true,
                                })
                              }
                              className="rounded bg-amber-950 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-900"
                            >
                              Mark Trusted Lender
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "my-listings" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(authTools || [])
              .filter((t: any) => t.ownerUserId === profile?.clerkUserId)
              .map((tool: any) => (
                <div
                  key={tool._id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
                >
                  <div className="font-semibold text-white">{tool.name}</div>
                  <div className="text-xs text-slate-400">
                    {tool.category} · Status: {tool.status}
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === "my-requests" && (
          <div className="space-y-3">
            {(loansBundle?.borrowerLoans || []).map((loan: any) => (
              <div
                key={loan._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div>
                  <div className="font-semibold text-white">
                    {loan.toolName}
                  </div>
                  <div className="text-xs text-slate-400">
                    {loan.startDate} → {loan.endDate} · Status: {loan.status}
                  </div>
                  {loan.reminderCount > 0 && (
                    <div className="mt-1 text-xs text-amber-300">
                      Overdue reminders sent: {loan.reminderCount}
                    </div>
                  )}
                </div>
                {loan.status === "approved" && (
                  <button
                    type="button"
                    onClick={() => markLoanReturned({ loanId: loan._id })}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
                  >
                    Mark Returned
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "incoming" && (
          <div className="space-y-3">
            {(loansBundle?.incomingRequests || []).map((loan: any) => (
              <div
                key={loan._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div>
                  <div className="font-semibold text-white">
                    {loan.toolName}
                  </div>
                  <div className="text-xs text-slate-400">
                    {loan.startDate} → {loan.endDate} · Status: {loan.status}
                  </div>
                </div>
                <div className="flex gap-2">
                  {loan.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          respondToLoanRequest({
                            loanId: loan._id,
                            decision: "approved",
                          })
                        }
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          respondToLoanRequest({
                            loanId: loan._id,
                            decision: "declined",
                          })
                        }
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {loan.status === "approved" && (
                    <button
                      type="button"
                      onClick={() => markLoanReturned({ loanId: loan._id })}
                      className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Mark Returned
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Show>
    </div>
  );
}

export default function HomePage() {
  return (
    <ConvexClientProvider>
      <LendLoopBoard />
    </ConvexClientProvider>
  );
}
