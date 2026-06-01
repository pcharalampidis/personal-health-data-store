import { useState, useCallback } from "react";
import type { BrowserProvider } from "ethers";
import { getUserRegistryContract } from "../services/contracts.js";
import type { DoctorIdentity } from "../types/profiles.js";

export function formatAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function useDoctorProfiles(provider: BrowserProvider | null) {
  const [cache, setCache] = useState<Record<string, DoctorIdentity>>({});

  const resolveDoctor = useCallback(
    async (address: string): Promise<DoctorIdentity> => {
      if (!address) {
        return getFallbackProfile("");
      }
      const cleanAddress = address.toLowerCase();

      // Return cached entry if it exists
      if (cache[cleanAddress]) {
        return cache[cleanAddress];
      }

      const fallback = getFallbackProfile(address);
      if (!provider) {
        return fallback;
      }

      try {
        const contract = getUserRegistryContract(provider);
        const isVerified = await contract.isDoctorVerified(address);

        if (!isVerified) {
          const result: DoctorIdentity = {
            ...fallback,
            isVerified: false,
            displaySubtitle: "Unregistered doctor wallet",
          };
          setCache((prev) => ({ ...prev, [cleanAddress]: result }));
          return result;
        }

        const rawProfile = await contract.getDoctorProfile(address);
        const nameStr = rawProfile.name || "";
        const displayName = nameStr.toLowerCase().startsWith("dr.")
          ? nameStr
          : `Dr. ${nameStr}`;

        const profile: DoctorIdentity = {
          address,
          name: nameStr,
          licenseNumber: rawProfile.licenseNumber,
          specialty: rawProfile.specialty,
          institution: rawProfile.institution,
          registeredAt: rawProfile.registeredAt,
          isVerified: true,
          displayName,
          displaySubtitle: `${rawProfile.specialty} — ${rawProfile.institution}`,
          formattedAddress: formatAddress(address),
        };

        setCache((prev) => ({ ...prev, [cleanAddress]: profile }));
        return profile;
      } catch (err) {
        console.error(`Error resolving doctor profile for ${address}:`, err);
        return fallback;
      }
    },
    [provider, cache]
  );

  return { resolveDoctor, cache };
}

function getFallbackProfile(address: string): DoctorIdentity {
  return {
    address,
    name: "Unknown Doctor",
    licenseNumber: "",
    specialty: "",
    institution: "",
    registeredAt: null,
    isVerified: false,
    displayName: address ? formatAddress(address) : "Unknown Address",
    displaySubtitle: "Unregistered doctor profile",
    formattedAddress: address ? formatAddress(address) : "",
  };
}
