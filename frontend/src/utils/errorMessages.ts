/**
 * Normalise raw wallet/blockchain errors into user-friendly messages.
 */

export interface FriendlyError {
  title: string;
  message: string;
  technicalDetails?: string;
  isUserRejected?: boolean;
}

export function getFriendlyError(error: unknown): FriendlyError {
  const raw = error as Record<string, unknown> | null;
  const text = String(
    raw?.shortMessage || raw?.reason || raw?.message || error
  );
  const info = raw?.info as Record<string, unknown> | undefined;
  const code = raw?.code ?? (info?.error as Record<string, unknown>)?.code ?? (raw?.error as Record<string, unknown>)?.code;

  // User rejected in wallet
  if (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    text.toLowerCase().includes("user rejected") ||
    text.toLowerCase().includes("denied transaction")
  ) {
    return {
      title: "Wallet confirmation cancelled",
      message: "No changes were made. You can try again or choose a different wallet.",
      technicalDetails: text,
      isUserRejected: true,
    };
  }

  // Insufficient funds
  if (text.toLowerCase().includes("insufficient funds")) {
    return {
      title: "Not enough test ETH",
      message: "This wallet does not have enough funds to complete the action.",
      technicalDetails: text,
    };
  }

  // Contract revert
  if (text.toLowerCase().includes("revert") || text.toLowerCase().includes("execution reverted")) {
    // Try to extract the revert reason
    const match = text.match(/reason="([^"]+)"/);
    const reason = match?.[1];
    return {
      title: "Action could not be completed",
      message: reason || "The request was rejected by the system. Check your permissions and try again.",
      technicalDetails: text,
    };
  }

  // Network/connection
  if (text.toLowerCase().includes("network") || text.toLowerCase().includes("timeout") || text.toLowerCase().includes("fetch")) {
    return {
      title: "Connection problem",
      message: "Could not reach the network. Check your connection and try again.",
      technicalDetails: text,
    };
  }

  // Generic fallback
  return {
    title: "Something went wrong",
    message: "Please try again. If the problem persists, check your wallet connection.",
    technicalDetails: text,
  };
}

/** Convert a FriendlyError to a simple display string (for components using string error state) */
export function friendlyErrorMessage(error: unknown): string {
  const fe = getFriendlyError(error);
  return fe.title + (fe.message ? ": " + fe.message : "");
}
