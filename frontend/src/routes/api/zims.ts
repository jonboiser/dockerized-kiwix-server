import { APIEvent } from "@solidjs/start/server";
import { listInstalledZims, deleteInstalledZim, getZimDir } from "../../lib/downloads";
import { formatBytes } from "../../lib/zimfarm";

export async function GET(event: APIEvent) {
  const zims = listInstalledZims();
  const totalSizeBytes = zims.reduce((acc, z) => acc + z.sizeBytes, 0);

  return new Response(
    JSON.stringify({
      zims,
      count: zims.length,
      totalSizeBytes,
      totalSizeFormatted: formatBytes(totalSizeBytes),
      zimDir: getZimDir()
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
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

    const success = deleteInstalledZim(fileName);

    return new Response(JSON.stringify({ success, fileName }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to delete ZIM" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
