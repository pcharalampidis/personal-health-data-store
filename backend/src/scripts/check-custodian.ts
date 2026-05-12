import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadProviderRegistry,
  validateProviderWallet,
} from "../services/custodian.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const REGISTRY_PATH = path.resolve(currentDir, "..", "..", "..", "custodian", "providers.json");

function expectCase(
  name: string,
  actual: { isRecognized: boolean; isActive: boolean },
  expected: { isRecognized: boolean; isActive: boolean }
): void {
  if (actual.isRecognized !== expected.isRecognized || actual.isActive !== expected.isActive) {
    throw new Error(
      `${name} failed: expected isRecognized=${expected.isRecognized}, isActive=${expected.isActive}; got isRecognized=${actual.isRecognized}, isActive=${actual.isActive}`
    );
  }

  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  const registry = await loadProviderRegistry(REGISTRY_PATH);
  const activeProvider = registry.providers.find((provider) => provider.status === "active");
  const suspendedProvider = registry.providers.find((provider) => provider.status === "suspended");

  if (!activeProvider || !suspendedProvider) {
    throw new Error("Registry must contain at least one active and one suspended provider");
  }

  expectCase(
    "active provider accepted",
    await validateProviderWallet(activeProvider.walletAddress, REGISTRY_PATH),
    { isRecognized: true, isActive: true }
  );

  expectCase(
    "suspended provider rejected",
    await validateProviderWallet(suspendedProvider.walletAddress, REGISTRY_PATH),
    { isRecognized: true, isActive: false }
  );

  expectCase(
    "missing provider rejected",
    await validateProviderWallet("0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", REGISTRY_PATH),
    { isRecognized: false, isActive: false }
  );

  expectCase(
    "malformed wallet rejected",
    await validateProviderWallet("not-a-wallet", REGISTRY_PATH),
    { isRecognized: false, isActive: false }
  );
}

main().catch((error: Error) => {
  console.error("Custodian registry checks failed:", error.message);
  process.exitCode = 1;
});
