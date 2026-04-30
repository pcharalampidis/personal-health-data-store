import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const REGISTRY_PATH = path.resolve(ROOT_DIR, "custodian", "providers.json");
const META_PATH = path.resolve(ROOT_DIR, "custodian", "registry-meta.json");
const ENV_PATH = path.resolve(ROOT_DIR, ".env");

function loadLocalEnv(content) {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=");
    }
  }
}

async function tryLoadEnv() {
  try {
    loadLocalEnv(await readFile(ENV_PATH, "utf-8"));
  } catch {
    // .env is optional for validation-only runs.
  }
}

function validateRegistry(registry) {
  if (!registry.registryName || !registry.custodian || !registry.version) {
    throw new Error("Registry metadata is incomplete");
  }

  if (!Array.isArray(registry.providers) || registry.providers.length === 0) {
    throw new Error("Registry must contain at least one provider");
  }

  const seen = new Set();
  for (const provider of registry.providers) {
    const required = ["walletAddress", "name", "licenseNumber", "institution", "specialty", "status", "encryptionPublicKey"];
    for (const field of required) {
      if (!provider[field]) {
        throw new Error(`Provider is missing required field: ${field}`);
      }
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(provider.walletAddress)) {
      throw new Error(`Invalid wallet address: ${provider.walletAddress}`);
    }

    const normalized = provider.walletAddress.toLowerCase();
    if (seen.has(normalized)) {
      throw new Error(`Duplicate provider wallet: ${provider.walletAddress}`);
    }
    seen.add(normalized);

    if (!["active", "suspended"].includes(provider.status)) {
      throw new Error(`Invalid provider status for ${provider.walletAddress}: ${provider.status}`);
    }

    if (!provider.encryptionPublicKey.startsWith("0x")) {
      throw new Error(`Invalid encryptionPublicKey for ${provider.walletAddress}`);
    }
  }
}

async function pinRegistry(registryBuffer) {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;

  if (!apiKey || !secretKey) {
    console.log("Pinata credentials not configured. Registry validation completed without pinning.");
    return null;
  }

  const formData = new FormData();
  const blob = new Blob([registryBuffer], { type: "application/json" });
  formData.append("file", blob, "custodian-providers.json");
  formData.append(
    "pinataMetadata",
    JSON.stringify({ name: "phds-custodian-provider-registry" })
  );

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      pinata_api_key: apiKey,
      pinata_secret_api_key: secretKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Pinata pin failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function main() {
  await tryLoadEnv();

  const registryContent = await readFile(REGISTRY_PATH);
  const registry = JSON.parse(registryContent.toString("utf-8"));
  validateRegistry(registry);

  console.log(`Validated ${registry.providers.length} provider(s) in Custodian registry.`);

  const pinResult = await pinRegistry(registryContent);
  if (!pinResult) {
    return;
  }

  const metadata = {
    registryName: registry.registryName,
    version: registry.version,
    providerCount: registry.providers.length,
    ipfsCid: pinResult.IpfsHash,
    pinSize: pinResult.PinSize,
    pinnedAt: pinResult.Timestamp,
  };

  await writeFile(META_PATH, JSON.stringify(metadata, null, 2));

  console.log("Custodian registry pinned to IPFS:");
  console.log(`  CID: ${pinResult.IpfsHash}`);
  console.log(`  Metadata: ${META_PATH}`);
}

main().catch((error) => {
  console.error("Custodian registry pin failed:", error.message);
  process.exitCode = 1;
});
