const LEGACY_SALT = new TextEncoder().encode("runviz-strava-key");
const CURRENT_VERSION = "v2:";

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    raw,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(secret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return `${CURRENT_VERSION}${toBase64(combined)}`;
}

export async function decrypt(b64: string, secret: string): Promise<string> {
  const isCurrentFormat = b64.startsWith(CURRENT_VERSION);
  const data = fromBase64(isCurrentFormat ? b64.slice(CURRENT_VERSION.length) : b64);
  const salt = isCurrentFormat ? data.slice(0, 16) : LEGACY_SALT;
  const ivOffset = isCurrentFormat ? 16 : 0;
  const iv = data.slice(ivOffset, ivOffset + 12);
  const ciphertext = data.slice(ivOffset + 12);
  const key = await deriveKey(secret, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}
