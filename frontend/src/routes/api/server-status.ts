import { APIEvent } from "@solidjs/start/server";

export async function GET(event: APIEvent) {
  const kiwixUrl = process.env.KIWIX_SERVER_URL || "http://localhost:8080";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(kiwixUrl, {
      method: "GET",
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    return new Response(
      JSON.stringify({
        online: res.ok || res.status === 200 || res.status === 404,
        statusText: res.statusText,
        statusCode: res.status,
        kiwixUrl
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        online: false,
        statusText: err.message || "Connection refused",
        kiwixUrl
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
