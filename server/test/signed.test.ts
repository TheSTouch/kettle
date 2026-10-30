import assert from "node:assert/strict";
import { test } from "node:test";
import { base64url, base64urlDecode, Signer } from "../src/signed.ts";
import { SECRET } from "./support.ts";

test("a signed value verifies as its own kind until it expires", async () => {
  const signer = new Signer(SECRET);
  const value = await signer.sign({ k: "token", e: 200, s: "76561198000000001" });
  assert.deepEqual(await signer.verify(value, "token", 199), { k: "token", e: 200, s: "76561198000000001" });
  assert.equal(await signer.verify(value, "token", 200), null);
  assert.equal(await signer.verify(value, "code", 100), null);
  assert.equal(await signer.verify(value, "state", 100), null);
});

test("the format is base64url(payload).base64url(HMAC over kettle1.payload)", async () => {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ k: "code", e: 10 })));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("kettle1." + payload)));
  const value = payload + "." + base64url(mac);
  assert.equal(await new Signer(SECRET).sign({ k: "code", e: 10 }), value);
  assert.ok(!value.includes("="));
});

test("tampering, another secret and garbage are refused", async () => {
  const signer = new Signer(SECRET);
  const value = await signer.sign({ k: "token", e: 200, s: "76561198000000001" });
  const [body, mac] = value.split(".") as [string, string];
  const forged = base64url(new TextEncoder().encode(JSON.stringify({ k: "token", e: 200, s: "76561198000000002" })));
  assert.equal(await signer.verify(forged + "." + mac, "token", 0), null);
  const flipped = mac.slice(0, -2) + (mac.at(-2) === "A" ? "B" : "A") + mac.at(-1);
  assert.equal(await signer.verify(body + "." + flipped, "token", 0), null);
  assert.equal(await new Signer(SECRET + "x").verify(value, "token", 0), null);
  for (const junk of ["", ".", "a.b", value + ".x", "!!!." + mac, body + ".", null, undefined])
    assert.equal(await signer.verify(junk, "token", 0), null);
});

test("base64url round-trips without padding and rejects other alphabets", () => {
  const bytes = new Uint8Array([0xfb, 0xff, 0xfe, 0x00, 0x01]);
  const text = base64url(bytes);
  assert.equal(text, "-__-AAE");
  assert.deepEqual(base64urlDecode(text), bytes);
  assert.equal(base64urlDecode("+/=="), null);
});
