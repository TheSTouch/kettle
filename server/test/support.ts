// A Kettle on a fixed clock and a fake Steam, and the app's side of the sign-in.

import { createKettle, type KettleOptions } from "../src/kettle.ts";
import { base64url, sha256 } from "../src/signed.ts";

export const BASE = "https://api.example.com/kettle";
export const REDIRECT = "mygame://kettle";
export const KEY = "PUBLISHERKEY0123456789ABCDEF";
export const SECRET = "0123456789abcdef0123456789abcdef";
export const STEAM_ID = "76561198000000001";
export const OTHER_ID = "76561198000000002";
export const VERIFIER = "verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
export const STEAM_OPENID = "https://steamcommunity.com/openid/login";

export type Call = { url: string; method: string; body: string };

export class FakeSteam {
  calls: Call[] = [];
  isValid = "is_valid:true";
  openidStatus = 200;
  ownsapp = true;
  ownerSteamId: string | null = null; // null: the caller
  ownershipStatus = 200;
  statsStatus = 200;
  throwOn: string | null = null; // URL prefix whose fetch rejects

  fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    this.calls.push({ url, method, body });
    if (this.throwOn && url.startsWith(this.throwOn)) throw new Error(`fetch failed for ${url}`);
    if (url === STEAM_OPENID && method === "POST")
      return new Response(`ns:http://specs.openid.net/auth/2.0\n${this.isValid}\n`, { status: this.openidStatus });
    if (url.startsWith("https://partner.steam-api.com/ISteamUser/CheckAppOwnership/v2/")) {
      const steamid = new URL(url).searchParams.get("steamid");
      return Response.json(
        {
          appownership: {
            ownsapp: this.ownsapp,
            permanent: this.ownsapp,
            timestamp: "2025-01-01T00:00:00Z",
            ownersteamid: this.ownsapp ? (this.ownerSteamId ?? steamid) : "0",
            sitelicense: false,
            result: "OK",
          },
        },
        { status: this.ownershipStatus },
      );
    }
    if (url === "https://partner.steam-api.com/ISteamUserStats/SetUserStatsForGame/v1/" && method === "POST")
      return Response.json({ result: { result: 1 } }, { status: this.statsStatus });
    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;
}

export function setup(overrides: Partial<KettleOptions> = {}) {
  const steam = new FakeSteam();
  const clock = { t: 1_764_633_600 };
  const kettle = createKettle({
    baseURL: BASE,
    appId: 892970,
    publisherKey: KEY,
    sessionSecret: SECRET,
    redirectURIs: [REDIRECT],
    fetch: steam.fetch,
    now: () => clock.t,
    ...overrides,
  });
  const get = (path: string, headers: Record<string, string> = {}) =>
    kettle.handle(new Request(path.startsWith("https:") ? path : BASE + path, { headers }));
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    kettle.handle(
      new Request(BASE + path, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
  return { kettle, steam, clock, get, send };
}

export type Setup = ReturnType<typeof setup>;

export async function challengeFor(verifier: string): Promise<string> {
  return base64url(await sha256(verifier));
}

// GET /steam/start, answered with the Steam login URL's return_to.
export async function start(s: Setup, verifier = VERIFIER): Promise<string> {
  const query = new URLSearchParams({
    redirect_uri: REDIRECT,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "S256",
  });
  const response = await s.get("/steam/start?" + query);
  if (response.status !== 302) throw new Error(`start answered ${response.status}`);
  return new URL(response.headers.get("location")!).searchParams.get("openid.return_to")!;
}

// What Steam appends to return_to after a sign-in.
export function assertion(returnTo: string, steamId = STEAM_ID, overrides: Record<string, string | null> = {}) {
  const claimed = `https://steamcommunity.com/openid/id/${steamId}`;
  const fields: Record<string, string | null> = {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID,
    "openid.claimed_id": claimed,
    "openid.identity": claimed,
    "openid.return_to": returnTo,
    "openid.response_nonce": "2025-12-02T00:00:00ZabcDEF",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "c2lnbmF0dXJl",
    ...overrides,
  };
  const url = new URL(returnTo);
  for (const [name, value] of Object.entries(fields)) if (value !== null) url.searchParams.set(name, value);
  return url.href;
}

// start → callback, answered with the redirect's query.
export async function callback(s: Setup, overrides: Record<string, string | null> = {}, steamId = STEAM_ID) {
  const returnTo = await start(s);
  const response = await s.get(assertion(returnTo, steamId, overrides));
  const location = response.headers.get("location");
  return { response, query: location ? new URL(location).searchParams : null };
}

// The whole sign-in: answered with the session token.
export async function signIn(s: Setup, steamId = STEAM_ID): Promise<string> {
  const { query } = await callback(s, {}, steamId);
  const response = await s.send("POST", "/steam/token", { code: query!.get("code"), code_verifier: VERIFIER });
  if (response.status !== 200) throw new Error(`token answered ${response.status}`);
  return ((await response.json()) as { token: string }).token;
}
