import { APIEvent } from "@solidjs/start/server";
import { parseOpdsXml } from "../../lib/zimfarm";

export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const query = url.searchParams.get("q") || "";
    const lang = url.searchParams.get("lang") || "";
    const category = url.searchParams.get("category") || "";
    const count = url.searchParams.get("count") || "100";

    let kiwixCatalogUrl = `https://library.kiwix.org/catalog/v2/entries?count=${count}`;
    if (lang) {
      kiwixCatalogUrl += `&lang=${encodeURIComponent(lang)}`;
    }

    const response = await fetch(kiwixCatalogUrl, {
      headers: {
        "User-Agent": "Dockerized-Kiwix-Server-Installer/1.0",
        "Accept": "application/atom+xml, application/xml, text/xml"
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Catalog API error: ${response.statusText}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const xmlText = await response.text();
    let entries = parseOpdsXml(xmlText);

    // Filter by search query if provided
    if (query.trim()) {
      const qLower = query.toLowerCase().trim();
      entries = entries.filter((e) =>
        e.title.toLowerCase().includes(qLower) ||
        e.summary.toLowerCase().includes(qLower) ||
        e.fileName.toLowerCase().includes(qLower) ||
        e.name.toLowerCase().includes(qLower)
      );
    }

    // Filter by category if provided
    if (category && category !== "all") {
      const cLower = category.toLowerCase().trim();
      entries = entries.filter((e) => e.category.toLowerCase() === cLower);
    }

    return new Response(JSON.stringify({ entries, total: entries.length }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (err: any) {
    console.error("Error fetching catalog:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed to fetch catalog" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
