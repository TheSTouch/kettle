// Serving a Kettle on Node's http module: IncomingMessage in, Response out.

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Kettle } from "./kettle.ts";

async function toRequest(message: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(message.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (value !== undefined) headers.set(name, value);
  }
  const method = message.method ?? "GET";
  let body: Uint8Array | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of message) chunks.push(chunk as Buffer);
    body = Buffer.concat(chunks);
  }
  const url = new URL(message.url ?? "/", `http://${message.headers.host ?? "localhost"}`);
  return new Request(url, { method, headers, body });
}

export function serve(kettle: Kettle, options: { port: number; host?: string }): Server {
  const server = createServer(async (message, out) => {
    try {
      const response = await kettle.handle(await toRequest(message));
      out.writeHead(response.status, Object.fromEntries(response.headers));
      out.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      out.writeHead(500, { "content-type": "application/json" });
      out.end(JSON.stringify({ error: "server_error", message: "unexpected error" }));
    }
  });
  server.listen(options.port, options.host);
  return server;
}
