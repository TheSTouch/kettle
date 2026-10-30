// Steam's partner Web API, called with the publisher key. Errors never carry the key: a
// failed call is a bare SteamUnavailable, whatever fetch said.

const PARTNER = "https://partner.steam-api.com";

export type Ownership = "owned" | "family_shared" | "not_owned";

export class SteamUnavailable extends Error {
  constructor() {
    super("Steam could not be reached");
    this.name = "SteamUnavailable";
  }
}

async function call(fetch: typeof globalThis.fetch, url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new SteamUnavailable();
  }
  if (!response.ok) throw new SteamUnavailable();
  return response;
}

export async function checkOwnership(
  fetch: typeof globalThis.fetch,
  key: string,
  appId: number,
  steamId: string,
): Promise<Ownership> {
  const url = new URL(PARTNER + "/ISteamUser/CheckAppOwnership/v2/");
  url.searchParams.set("key", key);
  url.searchParams.set("steamid", steamId);
  url.searchParams.set("appid", String(appId));
  const response = await call(fetch, url.href);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SteamUnavailable();
  }
  const ownership = (body as { appownership?: { ownsapp?: unknown; ownersteamid?: unknown } } | null)?.appownership;
  if (typeof ownership !== "object" || ownership === null) throw new SteamUnavailable();
  if (ownership.ownsapp !== true) return "not_owned";
  return String(ownership.ownersteamid) === steamId ? "owned" : "family_shared";
}

export async function unlockAchievements(
  fetch: typeof globalThis.fetch,
  key: string,
  appId: number,
  steamId: string,
  names: string[],
): Promise<void> {
  const form = new URLSearchParams();
  form.set("key", key);
  form.set("steamid", steamId);
  form.set("appid", String(appId));
  form.set("count", String(names.length));
  names.forEach((name, i) => {
    form.set(`name[${i}]`, name);
    form.set(`value[${i}]`, "1");
  });
  await call(fetch, PARTNER + "/ISteamUserStats/SetUserStatsForGame/v1/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}
