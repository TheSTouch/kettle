import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { serve } from "../src/node.ts";
import { createKettle } from "../src/kettle.ts";
import { KEY, REDIRECT, SECRET } from "./support.ts";

test("the Node adapter passes method, headers, body and status through", async () => {
  const kettle = createKettle({
    baseURL: "https://api.example.com/kettle",
    appId: 1,
    publisherKey: KEY,
    sessionSecret: SECRET,
    redirectURIs: [REDIRECT],
  });
  const server = serve(kettle, { port: 0, host: "127.0.0.1" });
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const base = `http://127.0.0.1:${port}/kettle`;
    const token = await fetch(base + "/steam/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "x", code_verifier: "y" }),
    });
    assert.equal(token.status, 400);
    assert.equal(((await token.json()) as { error: string }).error, "invalid_grant");
    const owner = await fetch(base + "/steam/ownership");
    assert.equal(owner.status, 401);
    assert.match(owner.headers.get("www-authenticate") ?? "", /^Bearer/);
    const start = await fetch(base + "/steam/start?redirect_uri=x", { redirect: "manual" });
    assert.equal(start.status, 400);
  } finally {
    server.close();
  }
});
