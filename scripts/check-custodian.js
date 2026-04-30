import { readFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY_PATH = path.resolve(process.cwd(), "custodian", "providers.json");

function normalizeAddress(walletAddress) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return null;
  }
  return walletAddress.toLowerCase();
}

function validateWallet(registry, walletAddress) {
  const normalized = normalizeAddress(walletAddress);
  if (!normalized) {
    return { isRecognized: false, isActive: false, reason: "Invalid wallet address" };
  }

  const provider = registry.providers.find((item) => {
    return normalizeAddress(item.walletAddress) === normalized;
  });

  if (!provider) {
    return { isRecognized: false, isActive: false, reason: "Provider wallet not found in Custodian registry" };
  }

  return {
    isRecognized: true,
    isActive: provider.status === "active",
    reason: provider.status === "active" ? undefined : `Provider status is ${provider.status}`,
  };
}

function expectCase(name, result, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (result[key] !== value) {
      throw new Error(`${name} failed: expected ${key}=${value}, got ${result[key]}`);
    }
  }

  console.log(`PASS ${name}`);
}

async function main() {
  const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf-8"));
  const activeProvider = registry.providers.find((provider) => provider.status === "active");
  const suspendedProvider = registry.providers.find((provider) => provider.status === "suspended");

  if (!activeProvider || !suspendedProvider) {
    throw new Error("Registry must contain at least one active and one suspended provider");
  }

  expectCase("active provider accepted", validateWallet(registry, activeProvider.walletAddress), {
    isRecognized: true,
    isActive: true,
  });
  expectCase("suspended provider rejected", validateWallet(registry, suspendedProvider.walletAddress), {
    isRecognized: true,
    isActive: false,
  });
  expectCase("missing provider rejected", validateWallet(registry, "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"), {
    isRecognized: false,
    isActive: false,
  });
  expectCase("malformed wallet rejected", validateWallet(registry, "not-a-wallet"), {
    isRecognized: false,
    isActive: false,
  });
}

main().catch((error) => {
  console.error("Custodian registry checks failed:", error.message);
  process.exitCode = 1;
});
