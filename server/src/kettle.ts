// The Kettle reference server: docs/protocol.md on web-standard Request and Response, so the
// same handler runs on Node (src/node.ts), Cloudflare Workers, Deno and Bun.

import { verifyCallback, steamLoginURL } from "./openid.ts";
import { base64url, sha256, Signer } from "./signed.ts";
import { checkOwnership, SteamUnavailable, unlockAchievements } from "./steam.ts";

export type KettleOptions = {
  // The server's public base URL; the protocol's paths are relative to it.
  baseURL: string;
  // The game's Steam app id.
  appId: number;
  // The Steam publisher Web API key. Stays on the server; never logged or sent back.
  publisherKey: string;
  // Signs state, codes and tokens: at least 32 bytes. Rotating it signs every player out.
  sessionSecret: string;
  // Where the app may ask for the answer (exact match), e.g. "mygame://kettle".
  redirectURIs: string[];
  // Count a game lent through Steam Family Sharing as owned (default false).
  allowFamilySharing?: boolean;
  fetch?: typeof globalThis.fetch;
  // Unix seconds.
  now?: () => number;
};

export type Kettle = { handle(request: Request): Promise<Response> };

const STATE_LIFETIME = 10 * 60;
const CODE_LIFETIME = 2 * 60;
const TOKEN_LIFETIME = 30 * 24 * 60 * 60;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const ACHIEVEMENT = /^[A-Za-z0-9_]{1,128}$/;
const MAX_ACHIEVEMENTS = 50;

const ROUTES: Record<string, string> = {
  "/steam/start": "GET",
  "/steam/callback": "GET",
  "/steam/token": "POST",
  "/steam/ownership": "GET",
  "/steam/achievements": "POST",
  "/steam/account": "DELETE",
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

function error(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return json(status, { error: code, message }, headers);
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });
}

function withQuery(uri: string, name: string, value: string): string {
  const url = new URL(uri);
  url.searchParams.set(name, value);
  return url.href;
}

export function createKettle(options: KettleOptions): Kettle {
  const base = new URL(options.baseURL);
  if (base.search || base.hash) throw new Error("baseURL must not have a query or fragment");
  const baseHref = base.origin + base.pathname.replace(/\/+$/, "");
  const basePath = base.pathname.replace(/\/+$/, "");
  const realm = base.origin;
  if (!Number.isInteger(options.appId) || options.appId <= 0) throw new Error("appId must be a positive integer");
  if (!options.publisherKey) throw new Error("publisherKey is required");
  if (new TextEncoder().encode(options.sessionSecret ?? "").length < 32)
    throw new Error("sessionSecret must be at least 32 bytes");
  if (!Array.isArray(options.redirectURIs) || options.redirectURIs.length === 0)
    throw new Error("redirectURIs must list at least one URI");
  for (const uri of options.redirectURIs) {
    if (!URL.canParse(uri)) throw new Error(`redirect URI is not a URL: ${uri}`);
  }
  const redirectURIs = new Set(options.redirectURIs);
  const fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const { appId, publisherKey } = options;
  const allowFamilySharing = options.allowFamilySharing ?? false;
  const signer = new Signer(options.sessionSecret);

  const returnTo = (state: string) => withQuery(baseHref + "/steam/callback", "state", state);

  async function start(url: URL): Promise<Response> {
    const redirectURI = url.searchParams.get("redirect_uri");
    const challenge = url.searchParams.get("code_challenge");
    if (!redirectURI || !redirectURIs.has(redirectURI))
      return error(400, "invalid_request", "redirect_uri is not allowed");
    if (!challenge || !CHALLENGE.test(challenge))
      return error(400, "invalid_request", "code_challenge must be 43 base64url characters");
    if (url.searchParams.get("code_challenge_method") !== "S256")
      return error(400, "invalid_request", "code_challenge_method must be S256");
    const state = await signer.sign({ k: "state", e: now() + STATE_LIFETIME, r: redirectURI, c: challenge });
    return redirect(steamLoginURL(returnTo(state), realm));
  }

  async function callback(url: URL): Promise<Response> {
    const stateValue = url.searchParams.get("state");
    const state = await signer.verify(stateValue, "state", now());
    if (!state || typeof state.r !== "string" || !redirectURIs.has(state.r) || typeof state.c !== "string")
      return error(400, "invalid_request", "the sign-in state is missing, invalid or expired");
    const result = await verifyCallback(url.searchParams, returnTo(stateValue!), fetch);
    if (!result.ok) return redirect(withQuery(state.r, "error", result.error));
    const code = await signer.sign({ k: "code", e: now() + CODE_LIFETIME, s: result.steamId, c: state.c });
    return redirect(withQuery(state.r, "code", code));
  }

  async function token(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error(400, "invalid_request", "the body must be JSON");
    }
    const { code, code_verifier: verifier } = (body ?? {}) as { code?: unknown; code_verifier?: unknown };
    if (typeof code !== "string" || typeof verifier !== "string")
      return error(400, "invalid_request", "code and code_verifier are required");
    const grant = await signer.verify(code, "code", now());
    if (!grant || typeof grant.s !== "string" || typeof grant.c !== "string" || !VERIFIER.test(verifier))
      return error(400, "invalid_grant", "the code is invalid or expired");
    if (base64url(await sha256(verifier)) !== grant.c)
      return error(400, "invalid_grant", "the code_verifier does not match");
    const expiresAt = now() + TOKEN_LIFETIME;
    const session = await signer.sign({ k: "token", e: expiresAt, s: grant.s });
    return json(200, { token: session, steam_id: grant.s, expires_at: expiresAt });
  }

  async function bearer(request: Request): Promise<string | null> {
    const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "");
    const payload = await signer.verify(match?.[1], "token", now());
    return payload && typeof payload.s === "string" ? payload.s : null;
  }

  async function ownership(steamId: string): Promise<Response> {
    const reason = await checkOwnership(fetch, publisherKey, appId, steamId);
    const owns = reason === "owned" || (reason === "family_shared" && allowFamilySharing);
    return json(200, { steam_id: steamId, owns, reason, checked_at: now() });
  }

  async function achievements(request: Request, steamId: string): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error(400, "invalid_request", "the body must be JSON");
    }
    const names = (body as { names?: unknown } | null)?.names;
    if (
      !Array.isArray(names) ||
      names.length < 1 ||
      names.length > MAX_ACHIEVEMENTS ||
      !names.every((name) => typeof name === "string" && ACHIEVEMENT.test(name))
    )
      return error(400, "invalid_request", `names must list 1 to ${MAX_ACHIEVEMENTS} achievement API names`);
    await unlockAchievements(fetch, publisherKey, appId, steamId, names as string[]);
    return new Response(null, { status: 204 });
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.startsWith(basePath + "/") ? url.pathname.slice(basePath.length) : null;
    const method = path === null ? undefined : ROUTES[path];
    if (!method) return error(404, "not_found", "no such endpoint");
    if (request.method !== method) return error(405, "method_not_allowed", `use ${method}`, { allow: method });
    try {
      switch (path) {
        case "/steam/start":
          return await start(url);
        case "/steam/callback":
          return await callback(url);
        case "/steam/token":
          return await token(request);
      }
      const steamId = await bearer(request);
      if (!steamId)
        return error(401, "invalid_token", "sign in again", { "www-authenticate": 'Bearer error="invalid_token"' });
      switch (path) {
        case "/steam/ownership":
          return await ownership(steamId);
        case "/steam/achievements":
          return await achievements(request, steamId);
        default: // "/steam/account": the reference server keeps nothing to forget
          return new Response(null, { status: 204 });
      }
    } catch (e) {
      if (e instanceof SteamUnavailable) return error(502, "steam_unavailable", "Steam could not be reached");
      return error(500, "server_error", "unexpected error");
    }
  }

  return { handle };
}
