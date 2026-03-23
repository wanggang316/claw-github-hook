export async function verifySignature(
  secret: string,
  body: string,
  sigHeader: string | null,
): Promise<boolean> {
  if (!sigHeader || !sigHeader.startsWith("sha256=")) return false;

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const hexDigest = sigHeader.slice("sha256=".length);
  const signatureBytes = hexToBytes(hexDigest);
  const bodyBytes = encoder.encode(body);

  return crypto.subtle.verify("HMAC", key, signatureBytes, bodyBytes);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
