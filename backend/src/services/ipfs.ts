import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const PINATA_API_KEY = process.env.PINATA_API_KEY || "";
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY || "";
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud";

interface PinResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

/**
 * Pin encrypted file content to IPFS via Pinata.
 * The content must already be encrypted client-side before reaching this function.
 */
export async function pinToIPFS(
  encryptedContent: Buffer,
  fileName: string
): Promise<PinResponse> {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error("Pinata API keys not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY in .env");
  }

  const formData = new FormData();
  const blob = new Blob([encryptedContent], { type: "application/octet-stream" });
  formData.append("file", blob, fileName);

  const metadata = JSON.stringify({ name: fileName });
  formData.append("pinataMetadata", metadata);

  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata pin failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<PinResponse>;
}

/**
 * Fetch encrypted content from IPFS via Pinata gateway.
 */
export async function fetchFromIPFS(cid: string): Promise<Buffer> {
  const url = `${PINATA_GATEWAY}/ipfs/${cid}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`IPFS fetch failed (${response.status}): ${cid}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Unpin content from Pinata (for record deletion).
 */
export async function unpinFromIPFS(cid: string): Promise<void> {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error("Pinata API keys not configured");
  }

  const response = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
    method: "DELETE",
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata unpin failed (${response.status}): ${text}`);
  }
}
