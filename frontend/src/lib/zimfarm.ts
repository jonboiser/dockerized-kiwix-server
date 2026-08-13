import path from "node:path";

export interface ZimEntry {
  id: string;
  title: string;
  name: string;
  summary: string;
  language: string;
  languageName: string;
  category: string;
  sizeBytes: number;
  sizeFormatted: string;
  updated: string;
  iconUrl: string;
  downloadUrl: string;
  fileName: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  eng: "English",
  spa: "Spanish",
  fra: "French",
  deu: "German",
  zho: "Chinese",
  rus: "Russian",
  ara: "Arabic",
  por: "Portuguese",
  ita: "Italian",
  jpn: "Japanese",
  kor: "Korean",
  hin: "Hindi",
  ben: "Bengali",
  vie: "Vietnamese",
  pol: "Polish",
  ukr: "Ukrainian",
  nld: "Dutch",
  tur: "Turkish",
  fas: "Persian",
  swe: "Swedish"
};

export function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function getLanguageName(code: string): string {
  if (!code) return "Unknown";
  const clean = code.toLowerCase().trim();
  return LANGUAGE_NAMES[clean] || clean.toUpperCase();
}

export function parseOpdsXml(xmlText: string): ZimEntry[] {
  const entries: ZimEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entryBlock = match[1];

    const getTagContent = (tagName: string): string => {
      const tagRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
      const m = tagRegex.exec(entryBlock);
      return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : "";
    };

    const id = getTagContent("id");
    const title = getTagContent("title") || "Untitled ZIM";
    const summary = getTagContent("summary") || getTagContent("content");
    const language = getTagContent("language") || "eng";
    const name = getTagContent("name") || "";
    const category = getTagContent("category") || "general";
    const updated = getTagContent("updated");

    // Extract icon thumbnail
    const iconMatch = /<link[^>]*rel="http:\/\/opds-spec\.org\/image\/thumbnail"[^>]*href="([^"]+)"/i.exec(entryBlock);
    let iconUrl = iconMatch ? iconMatch[1] : "";
    if (iconUrl && iconUrl.startsWith("/")) {
      iconUrl = "https://library.kiwix.org" + iconUrl;
    }

    // Extract acquisition link (direct download or meta4 download)
    const acqMatch = /<link[^>]*rel="http:\/\/opds-spec\.org\/acquisition\/open-access"[^>]*href="([^"]+)"[^>]*length="(\d+)"/i.exec(entryBlock)
      || /<link[^>]*href="([^"]+\.zim(?:\.meta4)?)"[^>]*length="(\d+)"/i.exec(entryBlock)
      || /<link[^>]*href="([^"]+\.zim(?:\.meta4)?)"/i.exec(entryBlock);

    let downloadUrl = "";
    let sizeBytes = 0;

    if (acqMatch) {
      downloadUrl = acqMatch[1];
      if (acqMatch[2]) {
        sizeBytes = parseInt(acqMatch[2], 10);
      }
      // Replace .meta4 extension with direct .zim link if present
      if (downloadUrl.endsWith(".meta4")) {
        downloadUrl = downloadUrl.replace(/\.meta4$/, "");
      }
      if (downloadUrl.includes("lb.download.kiwix.org")) {
        downloadUrl = downloadUrl.replace("lb.download.kiwix.org", "download.kiwix.org");
      }
    }

    // Infer filename
    let fileName = "";
    if (downloadUrl) {
      const parts = downloadUrl.split("/");
      fileName = parts[parts.length - 1];
    } else if (name) {
      fileName = `${name}.zim`;
    } else {
      fileName = `${title.toLowerCase().replace(/[^a-z0-9]/g, "_")}.zim`;
    }

    if (downloadUrl) {
      entries.push({
        id: id || fileName,
        title,
        name,
        summary,
        language,
        languageName: getLanguageName(language),
        category: category || inferCategory(title, fileName),
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        updated,
        iconUrl,
        downloadUrl,
        fileName
      });
    }
  }

  return entries;
}

function inferCategory(title: string, fileName: string): string {
  const lower = (title + " " + fileName).toLowerCase();
  if (lower.includes("wikipedia")) return "wikipedia";
  if (lower.includes("stack") || lower.includes("overflow") || lower.includes("devdocs")) return "technology";
  if (lower.includes("gutenberg") || lower.includes("wikisource")) return "books";
  if (lower.includes("ted") || lower.includes("khan") || lower.includes("phet")) return "education";
  if (lower.includes("wiktionary") || lower.includes("wikiquote")) return "dictionary";
  if (lower.includes("wikivoyage") || lower.includes("geography")) return "travel";
  if (lower.includes("medical") || lower.includes("health") || lower.includes("wikimed")) return "medicine";
  return "general";
}
