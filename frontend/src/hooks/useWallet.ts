import { useState, useCallback, useEffect, useRef } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

/** MetaMask's first entry in accountsChanged is the newly selected account. */
async function connectWithAddress(
  eth: NonNullable<Window["ethereum"]>,
  address: string
): Promise<{ provider: BrowserProvider; signer: JsonRpcSigner; address: string }> {
  const browserProvider = new BrowserProvider(eth);
  const signer = await browserProvider.getSigner(address);
  const addr = await signer.getAddress();
  return { provider: browserProvider, signer, address: addr };
}

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  /** When MetaMask has several accounts permitted for this site, user must pick one. */
  const [pendingAccounts, setPendingAccounts] = useState<string[] | null>(null);
  const connectedRef = useRef(false);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("MetaMask is not installed. Please install MetaMask to continue.");
      return;
    }

    const eth = window.ethereum;
    await eth.request({ method: "eth_requestAccounts" });

    const permitted = (await eth.request({ method: "eth_accounts" })) as string[];
    if (permitted.length === 0) return;

    // ethers BrowserProvider.getSigner() without args always uses index 0 of eth_accounts,
    // not the account highlighted in MetaMask. Bind an explicit address instead.
    if (permitted.length === 1) {
      const { provider: p, signer: s, address } = await connectWithAddress(eth, permitted[0]);
      setAccount(address);
      setProvider(p);
      setSigner(s);
      connectedRef.current = true;
      setPendingAccounts(null);
      return;
    }

    setPendingAccounts(permitted);
  }, []);

  const confirmAccount = useCallback(async (address: string) => {
    if (!window.ethereum) return;
    const eth = window.ethereum;
    const { provider: p, signer: s, address: addr } = await connectWithAddress(eth, address);
    setAccount(addr);
    setProvider(p);
    setSigner(s);
    connectedRef.current = true;
    setPendingAccounts(null);
  }, []);

  const cancelAccountPick = useCallback(() => {
    setPendingAccounts(null);
  }, []);

  const refreshPermittedAccounts = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    const permitted = (await eth.request({ method: "eth_accounts" })) as string[];
    setPendingAccounts((prev) => {
      if (prev === null) return null;
      return permitted.length > 0 ? permitted : prev;
    });
  }, []);

  const disconnect = useCallback(() => {
    connectedRef.current = false;
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setPendingAccounts(null);
  }, []);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    const onAccountsChanged = async (newAccounts: unknown) => {
      if (!connectedRef.current) return;

      const accs = newAccounts as string[];
      if (accs.length === 0) {
        connectedRef.current = false;
        setAccount(null);
        setProvider(null);
        setSigner(null);
        return;
      }

      try {
        const primary = accs[0];
        const { provider: nextProvider, signer: nextSigner, address } = await connectWithAddress(
          eth,
          primary
        );
        setAccount(address);
        setProvider(nextProvider);
        setSigner(nextSigner);
      } catch {
        /* ignore */
      }
    };

    eth.on("accountsChanged", onAccountsChanged);
    return () => eth.removeListener("accountsChanged", onAccountsChanged);
  }, []);

  return {
    account,
    provider,
    signer,
    connect,
    disconnect,
    pendingAccounts,
    confirmAccount,
    cancelAccountPick,
    refreshPermittedAccounts,
  };
}
