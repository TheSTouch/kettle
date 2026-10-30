// "Sign in through Steam": Steam's OpenID 2.0 provider (docs/protocol.md, "Sign-in").

export const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;
// Fields the assertion's signature must cover, or check_authentication would vouch for
// a response whose identity or return address was swapped.
const MUST_SIGN = ["op_endpoint", "claimed_id", "identity", "return_to"];

export function steamLoginURL(returnTo: string, realm: string): string {
  const url = new URL(STEAM_OPENID);
  url.searchParams.set("openid.ns", OPENID_NS);
  url.searchParams.set("openid.mode", "checkid_setup");
  url.searchParams.set("openid.return_to", returnTo);
  url.searchParams.set("openid.realm", realm);
  url.searchParams.set("openid.identity", IDENTIFIER_SELECT);
  url.searchParams.set("openid.claimed_id", IDENTIFIER_SELECT);
  return url.href;
}

export type CallbackError = "access_denied" | "server_error" | "invalid_request";
export type CallbackResult = { ok: true; steamId: string } | { ok: false; error: CallbackError };

// Checks 2 to 6 of GET /steam/callback (the caller checked the state, check 1).
export async function verifyCallback(
  query: URLSearchParams,
  expectedReturnTo: string,
  fetch: typeof globalThis.fetch,
): Promise<CallbackResult> {
  const mode = query.get("openid.mode");
  if (mode === "cancel") return { ok: false, error: "access_denied" };
  if (mode !== "id_res") return { ok: false, error: "invalid_request" };
  if (query.get("openid.op_endpoint") !== STEAM_OPENID) return { ok: false, error: "invalid_request" };
  if (query.get("openid.return_to") !== expectedReturnTo) return { ok: false, error: "invalid_request" };
  const claimed = CLAIMED_ID.exec(query.get("openid.claimed_id") ?? "");
  if (!claimed) return { ok: false, error: "invalid_request" };
  const signed = (query.get("openid.signed") ?? "").split(",");
  if (!MUST_SIGN.every((field) => signed.includes(field))) return { ok: false, error: "invalid_request" };

  const form = new URLSearchParams();
  for (const [name, value] of query) if (name.startsWith("openid.")) form.append(name, value);
  form.set("openid.mode", "check_authentication");
  let body: string;
  try {
    const response = await fetch(STEAM_OPENID, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!response.ok) return { ok: false, error: "server_error" };
    body = await response.text();
  } catch {
    return { ok: false, error: "server_error" };
  }
  const valid = body.split("\n").some((line) => line.trim() === "is_valid:true");
  if (!valid) return { ok: false, error: "invalid_request" };
  return { ok: true, steamId: claimed[1]! };
}
