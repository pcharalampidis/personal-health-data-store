import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAddress, isAddress } from "ethers";

export type ProviderStatus = "active" | "suspended";

export interface CustodianProvider {
  walletAddress: string;
  name: string;
  licenseNumber: string;
  institution: string;
  specialty: string;
  status: ProviderStatus;
  encryptionPublicKey: string;
  verifiedAt: string;
  notes?: string;
}

export interface ProviderRegistry {
  registryName: string;
  custodian: string;
  version: string;
  updatedAt: string;
  providers: CustodianProvider[];
}

export interface ProviderValidationResult {
  walletAddress: string;
  isRecognized: boolean;
  isActive: boolean;
  provider?: CustodianProvider;
  reason?: string;
}

const DEFAULT_REGISTRY_PATH = path.resolve(process.cwd(), "..", "custodian", "providers.json");

export async function loadProviderRegistry(
  registryPath = process.env.CUSTODIAN_REGISTRY_PATH || DEFAULT_REGISTRY_PATH
): Promise<ProviderRegistry> {
  const content = await readFile(registryPath, "utf-8");
  const registry = JSON.parse(content) as ProviderRegistry;
  validateRegistryShape(registry);
  return registry;
}

export async function getProviderByWallet(
  walletAddress: string,
  registryPath?: string
): Promise<CustodianProvider | undefined> {
  if (!isAddress(walletAddress)) {
    return undefined;
  }

  const normalizedWallet = getAddress(walletAddress);
  const registry = await loadProviderRegistry(registryPath);

  return registry.providers.find((provider) => {
    return isAddress(provider.walletAddress) && getAddress(provider.walletAddress) === normalizedWallet;
  });
}

export async function validateProviderWallet(
  walletAddress: string,
  registryPath?: string
): Promise<ProviderValidationResult> {
  if (!isAddress(walletAddress)) {
    return {
      walletAddress,
      isRecognized: false,
      isActive: false,
      reason: "Invalid wallet address",
    };
  }

  const normalizedWallet = getAddress(walletAddress);
  const provider = await getProviderByWallet(normalizedWallet, registryPath);

  if (!provider) {
    return {
      walletAddress: normalizedWallet,
      isRecognized: false,
      isActive: false,
      reason: "Provider wallet not found in Custodian registry",
    };
  }

  if (provider.status !== "active") {
    return {
      walletAddress: normalizedWallet,
      isRecognized: true,
      isActive: false,
      provider,
      reason: `Provider status is ${provider.status}`,
    };
  }

  return {
    walletAddress: normalizedWallet,
    isRecognized: true,
    isActive: true,
    provider,
  };
}

export function validateRegistryShape(registry: ProviderRegistry): void {
  if (!registry.registryName || !registry.custodian || !registry.version) {
    throw new Error("Custodian registry missing required metadata");
  }

  if (!Array.isArray(registry.providers)) {
    throw new Error("Custodian registry providers must be an array");
  }

  const seenWallets = new Set<string>();

  for (const provider of registry.providers) {
    validateProvider(provider);

    const normalizedWallet = getAddress(provider.walletAddress);
    if (seenWallets.has(normalizedWallet)) {
      throw new Error(`Duplicate provider wallet in Custodian registry: ${normalizedWallet}`);
    }
    seenWallets.add(normalizedWallet);
  }
}

function validateProvider(provider: CustodianProvider): void {
  if (!isAddress(provider.walletAddress)) {
    throw new Error(`Invalid provider wallet address: ${provider.walletAddress}`);
  }

  if (!provider.name || !provider.licenseNumber || !provider.institution || !provider.specialty) {
    throw new Error(`Provider ${provider.walletAddress} is missing required identity fields`);
  }

  if (provider.status !== "active" && provider.status !== "suspended") {
    throw new Error(`Provider ${provider.walletAddress} has invalid status: ${provider.status}`);
  }

  if (!provider.encryptionPublicKey || !provider.encryptionPublicKey.startsWith("0x")) {
    throw new Error(`Provider ${provider.walletAddress} has invalid encryptionPublicKey`);
  }
}
