// Signed values (docs/protocol.md, "Signed values"): the sign-in's state, the one-time code
// and the session token share one format, an HMAC-SHA256 over the base64url JSON payload.

export type Kind = "state" | "code" | "token";

export type Payload = { k: Kind; e: number } & Record<string, unknown>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export class Signer {
  #key: ReturnType<typeof crypto.subtle.importKey>;

  constructor(secret: string) {
    this.#key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
  }

  async sign(payload: Payload): Promise<string> {
    const body = base64url(encoder.encode(JSON.stringify(payload)));
    const mac = await crypto.subtle.sign("HMAC", await this.#key, encoder.encode("kettle1." + body));
    return body + "." + base64url(new Uint8Array(mac));
  }

  // The payload when value is a well-formed, authentic, unexpired value of this kind; else null.
  // crypto.subtle.verify compares the MAC in constant time.
  async verify(value: string | null | undefined, kind: Kind, now: number): Promise<Payload | null> {
    if (typeof value !== "string") return null;
    const parts = value.split(".");
    if (parts.length !== 2) return null;
    const [body, macText] = parts as [string, string];
    const mac = base64urlDecode(macText);
    if (!mac || mac.length !== 32 || base64urlDecode(body) === null) return null;
    const authentic = await crypto.subtle.verify("HMAC", await this.#key, mac, encoder.encode("kettle1." + body));
    if (!authentic) return null;
    let payload: unknown;
    try {
      payload = JSON.parse(decoder.decode(base64urlDecode(body)!));
    } catch {
      return null;
    }
    if (typeof payload !== "object" || payload === null) return null;
    const p = payload as Record<string, unknown>;
    if (p.k !== kind || typeof p.e !== "number" || p.e <= now) return null;
    return p as Payload;
  }
}
