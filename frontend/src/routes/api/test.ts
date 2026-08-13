import { APIEvent } from "@solidjs/start/server";

export function GET(event: APIEvent) {
  return new Response(JSON.stringify({ status: "ok", message: "SolidStart 2 API working" }), {
    headers: { "content-type": "application/json" }
  });
}
