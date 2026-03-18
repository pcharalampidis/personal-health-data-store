import { useState, useCallback } from "react";
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

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("MetaMask is not installed. Please install MetaMask to continue.");
      return;
    }

    const browserProvider = new BrowserProvider(window.ethereum);
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];

    if (accounts.length === 0) return;

    const connectedSigner = await browserProvider.getSigner();
    setAccount(accounts[0]);
    setProvider(browserProvider);
    setSigner(connectedSigner);

    window.ethereum.on("accountsChanged", (newAccounts: unknown) => {
      const accs = newAccounts as string[];
      if (accs.length === 0) {
        setAccount(null);
        setProvider(null);
        setSigner(null);
      } else {
        setAccount(accs[0]);
      }
    });
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
  }, []);

  return { account, provider, signer, connect, disconnect };
}
