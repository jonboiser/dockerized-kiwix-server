import { APIEvent } from "@solidjs/start/server";
import { activeDownloads, startDownload, cancelDownload } from "../../lib/downloads";

export async function GET(event: APIEvent) {
  const jobs = Array.from(activeDownloads.values());
  return new Response(JSON.stringify({ downloads: jobs }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { url, fileName, title } = body;

    if (!url || !fileName) {
      return new Response(JSON.stringify({ error: "Missing required fields: url and fileName" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const job = startDownload(url, fileName, title || fileName);

    return new Response(JSON.stringify({ success: true, job }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to initiate download" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function DELETE(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { fileName } = body;

    if (!fileName) {
      return new Response(JSON.stringify({ error: "Missing required field: fileName" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const success = cancelDownload(fileName);

    return new Response(JSON.stringify({ success }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to cancel download" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
