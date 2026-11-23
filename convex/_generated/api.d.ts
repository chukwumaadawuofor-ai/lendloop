import type { FunctionReference } from "convex/server";

export declare const api: {
  tools: {
    listPublicAvailableTools: FunctionReference<"query", "public", Record<string, never>, any>;
    getCurrentUserProfile: FunctionReference<"query", "public", Record<string, never>, any>;
    listAuthenticatedTools: FunctionReference<"query", "public", { category: string }, any>;
    createTool: FunctionReference<"mutation", "public", any, any>;
    deleteTool: FunctionReference<"mutation", "public", any, any>;
    setTrustedLender: FunctionReference<"mutation", "public", any, any>;
  };
  loans: {
    listMyLoansAndRequests: FunctionReference<"query", "public", Record<string, never>, any>;
    requestBorrowTool: FunctionReference<"mutation", "public", any, any>;
    respondToLoanRequest: FunctionReference<"mutation", "public", any, any>;
    markLoanReturned: FunctionReference<"mutation", "public", any, any>;
  };
};

export declare const internal: Record<
  string,
  Record<string, FunctionReference<"internal", any, any, any>>
>;
