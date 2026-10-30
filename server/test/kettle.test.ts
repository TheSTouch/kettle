import assert from "node:assert/strict";
import { test } from "node:test";
import { createKettle } from "../src/kettle.ts";
import {
  assertion,
  BASE,
  callback,
  challengeFor,
  KEY,
  OTHER_ID,
  REDIRECT,
  SECRET,
  setup,
  signIn,
  start,
  STEAM_ID,
  STEAM_OPENID,
  VERIFIER,
} from "./support.ts";

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// --- sign-in ---------------------------------------------------------------------------

test("happy path: start, callback, token, ownership", async () => {
  const s = setup();
  const startResponse = await s.get(
    "/steam/start?" +
      new URLSearchParams({
        redirect_uri: REDIRECT,
        code_challenge: await challengeFor(VERIFIER),
        code_challenge_method: "S256",
      }),
  );
  assert.equal(startResponse.status, 302);
  const login = new URL(startResponse.headers.get("location")!);
  assert.equal(login.origin + login.pathname, STEAM_OPENID);
  assert.equal(login.searchParams.get("openid.ns"), "http://specs.openid.net/auth/2.0");
  assert.equal(login.searchParams.get("openid.mode"), "checkid_setup");
  assert.equal(login.searchParams.get("openid.realm"), "https://api.example.com");
  const select = "http://specs.openid.net/auth/2.0/identifier_select";
  assert.equal(login.searchParams.get("openid.identity"), select);
  assert.equal(login.searchParams.get("openid.claimed_id"), select);
  const returnTo = login.searchParams.get("openid.return_to")!;
  assert.match(returnTo, /^https:\/\/api\.example\.com\/kettle\/steam\/callback\?state=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

  const callbackResponse = await s.get(assertion(returnTo));
  assert.equal(callbackResponse.status, 302);
  const back = new URL(callbackResponse.headers.get("location")!);
  assert.equal(back.protocol + "//" + back.host, REDIRECT);
  const code = back.searchParams.get("code")!;
  assert.ok(code);

  const check = s.steam.calls.find((c) => c.url === STEAM_OPENID)!;
  const form = new URLSearchParams(check.body);
  assert.equal(check.method, "POST");
  assert.equal(form.get("openid.mode"), "check_authentication");
  assert.equal(form.get("openid.sig"), "c2lnbmF0dXJl");
  assert.equal(form.get("openid.claimed_id"), `https://steamcommunity.com/openid/id/${STEAM_ID}`);
  assert.ok(!form.has("state"));

  const tokenResponse = await s.send("POST", "/steam/token", { code, code_verifier: VERIFIER });
  assert.equal(tokenResponse.status, 200);
  const session = (await tokenResponse.json()) as { token: string; steam_id: string; expires_at: number };
  assert.equal(session.steam_id, STEAM_ID);
  assert.equal(session.expires_at, s.clock.t + 30 * 24 * 60 * 60);

  const ownershipResponse = await s.get("/steam/ownership", bearer(session.token));
  assert.equal(ownershipResponse.status, 200);
  assert.deepEqual(await ownershipResponse.json(), {
    steam_id: STEAM_ID,
    owns: true,
    reason: "owned",
    checked_at: s.clock.t,
  });
  const ask = new URL(s.steam.calls.at(-1)!.url);
  assert.equal(ask.origin + ask.pathname, "https://partner.steam-api.com/ISteamUser/CheckAppOwnership/v2/");
  assert.equal(ask.searchParams.get("key"), KEY);
  assert.equal(ask.searchParams.get("steamid"), STEAM_ID);
  assert.equal(ask.searchParams.get("appid"), "892970");
});

test("start refuses an unlisted redirect_uri, a bad challenge and another method", async () => {
  const s = setup();
  const challenge = await challengeFor(VERIFIER);
  const ask = (q: Record<string, string>) => s.get("/steam/start?" + new URLSearchParams(q));
  const cases: Array<Record<string, string>> = [
    { redirect_uri: "evil://kettle", code_challenge: challenge, code_challenge_method: "S256" },
    { redirect_uri: REDIRECT + "/", code_challenge: challenge, code_challenge_method: "S256" },
    { code_challenge: challenge, code_challenge_method: "S256" },
    { redirect_uri: REDIRECT, code_challenge: challenge.slice(1), code_challenge_method: "S256" },
    { redirect_uri: REDIRECT, code_challenge: challenge.slice(1) + "=", code_challenge_method: "S256" },
    { redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "plain" },
    { redirect_uri: REDIRECT, code_challenge: challenge },
  ];
  for (const q of cases) {
    const response = await ask(q);
    assert.equal(response.status, 400, JSON.stringify(q));
    assert.equal(((await response.json()) as { error: string }).error, "invalid_request");
  }
});

test("callback: a bad state answers 400 and sends the player nowhere", async () => {
  const s = setup();
  const returnTo = await start(s);
  const state = new URL(returnTo).searchParams.get("state")!;
  const expiredState = async () => {
    s.clock.t += 601;
    const r = await s.get(assertion(returnTo));
    s.clock.t -= 601;
    return r;
  };
  const wrongKind = await signIn(s); // a token is no state
  const bad = [
    await s.get(assertion(BASE + "/steam/callback")),
    await s.get(assertion(BASE + "/steam/callback?state=" + state.slice(0, -1) + "A")),
    await s.get(assertion(BASE + "/steam/callback?state=" + wrongKind)),
    await expiredState(),
  ];
  for (const r of bad) {
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("location"), null);
    assert.equal(((await r.json()) as { error: string }).error, "invalid_request");
  }
});

test("callback: the player cancelling comes back as access_denied", async () => {
  const s = setup();
  const returnTo = await start(s);
  const url = new URL(returnTo);
  url.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  url.searchParams.set("openid.mode", "cancel");
  const r = await s.get(url.href);
  assert.equal(r.status, 302);
  const back = new URL(r.headers.get("location")!);
  assert.equal(back.searchParams.get("error"), "access_denied");
  assert.equal(back.searchParams.get("code"), null);
  assert.equal(s.steam.calls.length, 0);
});

test("callback: each OpenID check refuses the sign-in", async () => {
  const cases: Record<string, Record<string, string | null>> = {
    "mode is not id_res": { "openid.mode": "setup_needed" },
    "another op_endpoint": { "openid.op_endpoint": "https://evil.example/openid/login" },
    "op_endpoint missing": { "openid.op_endpoint": null },
    "return_to for another state": { "openid.return_to": BASE + "/steam/callback?state=other" },
    "return_to with an extra parameter": { "openid.return_to": "EXTRA" },
    "claimed_id on another host": { "openid.claimed_id": `https://evil.example/openid/id/${STEAM_ID}` },
    "claimed_id over http": { "openid.claimed_id": `http://steamcommunity.com/openid/id/${STEAM_ID}` },
    "claimed_id not a SteamID64": { "openid.claimed_id": "https://steamcommunity.com/openid/id/12345" },
    "claimed_id with a suffix": { "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}/x` },
    "claimed_id outside the signature": { "openid.signed": "signed,op_endpoint,identity,return_to,response_nonce" },
  };
  for (const [name, overrides] of Object.entries(cases)) {
    const s = setup();
    const returnTo = await start(s);
    if (overrides["openid.return_to"] === "EXTRA") overrides["openid.return_to"] = returnTo + "&x=1";
    const r = await s.get(assertion(returnTo, STEAM_ID, overrides));
    assert.equal(r.status, 302, name);
    const back = new URL(r.headers.get("location")!);
    assert.equal(back.searchParams.get("error"), "invalid_request", name);
    assert.equal(back.searchParams.get("code"), null, name);
    assert.equal(s.steam.calls.length, 0, `${name}: Steam was not asked`);
  }
});

test("callback: Steam not vouching for the assertion refuses it", async () => {
  const s = setup();
  s.steam.isValid = "is_valid:false";
  const { query } = await callback(s);
  assert.equal(query!.get("error"), "invalid_request");
  assert.equal(query!.get("code"), null);
});

test("callback: Steam unreachable comes back as server_error", async () => {
  for (const breakIt of [
    (s: ReturnType<typeof setup>) => (s.steam.openidStatus = 503),
    (s: ReturnType<typeof setup>) => (s.steam.throwOn = STEAM_OPENID),
  ]) {
    const s = setup();
    breakIt(s);
    const { query } = await callback(s);
    assert.equal(query!.get("error"), "server_error");
  }
});

// --- token -------------------------------------------------------------------------------

test("token: the wrong verifier, an expired code and a forged code are invalid_grant", async () => {
  const s = setup();
  const { query } = await callback(s);
  const code = query!.get("code")!;
  const tries = [
    { code, code_verifier: VERIFIER + "x" },
    { code, code_verifier: "short" },
    { code: code.slice(0, -1) + (code.endsWith("A") ? "B" : "A"), code_verifier: VERIFIER },
    { code: await signIn(s), code_verifier: VERIFIER }, // a token is no code
  ];
  for (const body of tries) {
    const r = await s.send("POST", "/steam/token", body);
    assert.equal(r.status, 400);
    assert.equal(((await r.json()) as { error: string }).error, "invalid_grant");
  }
  s.clock.t += 121;
  const expired = await s.send("POST", "/steam/token", { code, code_verifier: VERIFIER });
  assert.equal(expired.status, 400);
  assert.equal(((await expired.json()) as { error: string }).error, "invalid_grant");
});

test("token: a malformed body is invalid_request", async () => {
  const s = setup();
  for (const body of ["not json", {}, { code: 1, code_verifier: VERIFIER }, "null"]) {
    const r = await s.send("POST", "/steam/token", body);
    assert.equal(r.status, 400);
    assert.equal(((await r.json()) as { error: string }).error, "invalid_request");
  }
});

// --- signed-in calls ----------------------------------------------------------------------

test("a missing, garbage, forged, wrong-kind or expired token is 401", async () => {
  const s = setup();
  const token = await signIn(s);
  const { query } = await callback(s);
  const headers = [
    {},
    { authorization: "Bearer" },
    { authorization: "Bearer garbage" },
    { authorization: `Basic ${token}` },
    bearer(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")),
    bearer(query!.get("code")!),
  ];
  for (const h of headers) {
    for (const [method, path] of [
      ["GET", "/steam/ownership"],
      ["POST", "/steam/achievements"],
      ["DELETE", "/steam/account"],
    ] as const) {
      const r = await s.send(method, path, method === "POST" ? { names: ["A"] } : undefined, h);
      assert.equal(r.status, 401, `${method} ${path} ${JSON.stringify(h)}`);
      assert.equal(((await r.json()) as { error: string }).error, "invalid_token");
      assert.match(r.headers.get("www-authenticate") ?? "", /^Bearer/);
    }
  }
  s.clock.t += 30 * 24 * 60 * 60;
  const expired = await s.get("/steam/ownership", bearer(token));
  assert.equal(expired.status, 401);
});

test("ownership: not owned, and family sharing under both settings", async () => {
  const s = setup();
  const token = await signIn(s);
  s.steam.ownsapp = false;
  assert.deepEqual(await (await s.get("/steam/ownership", bearer(token))).json(), {
    steam_id: STEAM_ID,
    owns: false,
    reason: "not_owned",
    checked_at: s.clock.t,
  });

  s.steam.ownsapp = true;
  s.steam.ownerSteamId = OTHER_ID;
  const shared = (await (await s.get("/steam/ownership", bearer(token))).json()) as { owns: boolean; reason: string };
  assert.equal(shared.reason, "family_shared");
  assert.equal(shared.owns, false);

  const allowing = setup({ allowFamilySharing: true });
  allowing.steam.ownerSteamId = OTHER_ID;
  const allowed = (await (await allowing.get("/steam/ownership", bearer(await signIn(allowing)))).json()) as {
    owns: boolean;
    reason: string;
  };
  assert.equal(allowed.reason, "family_shared");
  assert.equal(allowed.owns, true);
});

test("achievements: form encoding to SetUserStatsForGame", async () => {
  const s = setup();
  const token = await signIn(s);
  const r = await s.send("POST", "/steam/achievements", { names: ["ACH_WIN_ONE_GAME", "ach_2"] }, bearer(token));
  assert.equal(r.status, 204);
  const call = s.steam.calls.at(-1)!;
  assert.equal(call.method, "POST");
  assert.equal(call.url, "https://partner.steam-api.com/ISteamUserStats/SetUserStatsForGame/v1/");
  const form = new URLSearchParams(call.body);
  assert.equal(form.get("key"), KEY);
  assert.equal(form.get("steamid"), STEAM_ID);
  assert.equal(form.get("appid"), "892970");
  assert.equal(form.get("count"), "2");
  assert.equal(form.get("name[0]"), "ACH_WIN_ONE_GAME");
  assert.equal(form.get("value[0]"), "1");
  assert.equal(form.get("name[1]"), "ach_2");
  assert.equal(form.get("value[1]"), "1");
  assert.match(call.body, /name%5B0%5D=ACH_WIN_ONE_GAME/);
});

test("achievements: bad names are invalid_request and never reach Steam", async () => {
  const s = setup();
  const token = await signIn(s);
  const before = s.steam.calls.length;
  const bodies = [
    { names: [] },
    { names: ["ACH-DASH"] },
    { names: ["A B"] },
    { names: ["A".repeat(129)] },
    { names: Array.from({ length: 51 }, (_, i) => `A${i}`) },
    { names: [1] },
    { names: "ACH" },
    {},
    "not json",
  ];
  for (const body of bodies) {
    const r = await s.send("POST", "/steam/achievements", body, bearer(token));
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(((await r.json()) as { error: string }).error, "invalid_request");
  }
  assert.equal(s.steam.calls.length, before);
  const fifty = await s.send(
    "POST",
    "/steam/achievements",
    { names: Array.from({ length: 50 }, (_, i) => `A${i}`) },
    bearer(token),
  );
  assert.equal(fifty.status, 204);
  assert.equal(
    (
      await s.send("POST", "/steam/achievements", { names: ["A".repeat(128)] }, bearer(token))
    ).status,
    204,
  );
});

test("account: DELETE answers 204", async () => {
  const s = setup();
  const r = await s.send("DELETE", "/steam/account", undefined, bearer(await signIn(s)));
  assert.equal(r.status, 204);
});

test("Steam failing is 502 steam_unavailable, and the publisher key never shows", async () => {
  const s = setup();
  const token = await signIn(s);
  const failures: Array<[string, () => void]> = [
    ["ownership 500", () => (s.steam.ownershipStatus = 500)],
    ["ownership 403", () => (s.steam.ownershipStatus = 403)],
    ["ownership throws", () => (s.steam.throwOn = "https://partner.steam-api.com")],
    ["stats 500", () => (s.steam.statsStatus = 500)],
    ["stats throws", () => (s.steam.throwOn = "https://partner.steam-api.com")],
  ];
  for (const [name, breakIt] of failures) {
    s.steam.ownershipStatus = 200;
    s.steam.statsStatus = 200;
    s.steam.throwOn = null;
    breakIt();
    const r = name.startsWith("ownership")
      ? await s.get("/steam/ownership", bearer(token))
      : await s.send("POST", "/steam/achievements", { names: ["A"] }, bearer(token));
    assert.equal(r.status, 502, name);
    const text = await r.text();
    assert.equal(JSON.parse(text).error, "steam_unavailable", name);
    assert.ok(!text.includes(KEY), `${name}: the key leaked`);
    assert.ok(![...r.headers.values()].some((v) => v.includes(KEY)), `${name}: the key leaked in a header`);
  }
});

test("Steam answering ownership with something unexpected is 502", async () => {
  const s = setup({
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === STEAM_OPENID) return new Response("is_valid:true\n");
      if (url.includes("CheckAppOwnership")) return new Response("<html>oops</html>");
      return new Response(null, { status: 404 });
    }) as typeof globalThis.fetch,
  });
  const r = await s.get("/steam/ownership", bearer(await signIn(s)));
  assert.equal(r.status, 502);
});

// --- routing and options --------------------------------------------------------------------

test("unknown paths are 404 and wrong methods 405", async () => {
  const s = setup();
  for (const path of ["/steam", "/steam/", "/steam/nope", "/", "/steam/start/x"]) {
    const r = await s.get(path);
    assert.equal(r.status, 404, path);
    assert.equal(((await r.json()) as { error: string }).error, "not_found");
  }
  const outside = await s.kettle.handle(new Request("https://api.example.com/steam/start"));
  assert.equal(outside.status, 404);
  const prefix = await s.kettle.handle(new Request("https://api.example.com/kettlex/steam/start"));
  assert.equal(prefix.status, 404);
  for (const [method, path, allow] of [
    ["POST", "/steam/start", "GET"],
    ["GET", "/steam/token", "POST"],
    ["POST", "/steam/ownership", "GET"],
    ["GET", "/steam/achievements", "POST"],
    ["GET", "/steam/account", "DELETE"],
    ["PUT", "/steam/callback", "GET"],
  ] as const) {
    const r = await s.kettle.handle(new Request(BASE + path, { method }));
    assert.equal(r.status, 405, `${method} ${path}`);
    assert.equal(r.headers.get("allow"), allow);
  }
});

test("a base URL at the root or with a trailing slash routes the same", async () => {
  for (const baseURL of ["https://api.example.com", "https://api.example.com/", "https://api.example.com/kettle/"]) {
    const kettle = createKettle({ baseURL, appId: 1, publisherKey: KEY, sessionSecret: SECRET, redirectURIs: [REDIRECT] });
    const root = new URL(baseURL).pathname.replace(/\/+$/, "");
    const r = await kettle.handle(new Request("https://api.example.com" + root + "/steam/ownership"));
    assert.equal(r.status, 401, baseURL);
  }
});

test("createKettle refuses a short secret and bad options", () => {
  const ok = { baseURL: BASE, appId: 1, publisherKey: KEY, sessionSecret: SECRET, redirectURIs: [REDIRECT] };
  assert.doesNotThrow(() => createKettle(ok));
  assert.throws(() => createKettle({ ...ok, sessionSecret: SECRET.slice(1) }), /32 bytes/);
  assert.throws(() => createKettle({ ...ok, appId: 0 }), /appId/);
  assert.throws(() => createKettle({ ...ok, appId: 1.5 }), /appId/);
  assert.throws(() => createKettle({ ...ok, publisherKey: "" }), /publisherKey/);
  assert.throws(() => createKettle({ ...ok, redirectURIs: [] }), /redirectURIs/);
  assert.throws(() => createKettle({ ...ok, redirectURIs: ["not a url"] }), /redirect URI/);
  assert.throws(() => createKettle({ ...ok, baseURL: BASE + "?x=1" }), /baseURL/);
});
