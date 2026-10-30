// Runs the reference server on Node from the environment:
//   KETTLE_BASE_URL, KETTLE_APP_ID, STEAM_PUBLISHER_KEY, KETTLE_SESSION_SECRET,
//   KETTLE_REDIRECT_URIS (comma-separated), KETTLE_ALLOW_FAMILY_SHARING (true/false),
//   PORT (default 8787)

import { createKettle } from "./src/kettle.ts";
import { serve } from "./src/node.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
  return value;
}

const kettle = createKettle({
  baseURL: required("KETTLE_BASE_URL"),
  appId: Number(required("KETTLE_APP_ID")),
  publisherKey: required("STEAM_PUBLISHER_KEY"),
  sessionSecret: required("KETTLE_SESSION_SECRET"),
  redirectURIs: required("KETTLE_REDIRECT_URIS")
    .split(",")
    .map((uri) => uri.trim())
    .filter(Boolean),
  allowFamilySharing: process.env.KETTLE_ALLOW_FAMILY_SHARING === "true",
});

const port = Number(process.env.PORT ?? 8787);
serve(kettle, { port });
console.log(`Kettle listening on port ${port} for ${process.env.KETTLE_BASE_URL}`);
