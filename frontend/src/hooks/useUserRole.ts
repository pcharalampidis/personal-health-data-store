import { useState, useCallback } from "react";
import type { BrowserProvider } from "ethers";
import { getUserRegistryContract, USER_REGISTRY_ADDRESS } from "../services/contracts.js";

export type UserRole = "unregistered" | "patient" | "doctor";

export function useUserRole(account: string | null, provider: BrowserProvider | null) {
  const [role, setRole] = useState<UserRole>("unregistered");
  const [loading, setLoading] = useState(false);

  const loadRole = useCallback(async () => {
    if (!account || !provider) {
      setRole("unregistered");
      return;
    }

    setLoading(true);

    try {
      const code = await provider.getCode(USER_REGISTRY_ADDRESS);
      if (code === "0x") {
        setRole("unregistered");
        return;
      }

      const contract = getUserRegistryContract(provider);
      const isRegistered = await contract.isRegistered(account);

      if (!isRegistered) {
        setRole("unregistered");
        return;
      }

      const roleNum = await contract.getUserRole(account);
      const roleValue = Number(roleNum);

      if (roleValue === 1) {
        setRole("patient");
      } else if (roleValue === 2) {
        setRole("doctor");
      } else {
        setRole("unregistered");
      }
    } catch {
      setRole("unregistered");
    } finally {
      setLoading(false);
    }
  }, [account, provider]);

  return { role, loading, loadRole };
}
