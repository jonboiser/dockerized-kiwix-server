import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import { URL } from "url";
import { formatBytes } from "./zimfarm";

export interface DownloadJob {
  id: string;
  fileName: string;
  title: string;
  url: string;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
  speedBytesPerSec: number;
  status: "queued" | "downloading" | "completed" | "failed" | "cancelled";
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface InstalledZim {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  sizeFormatted: string;
  modifiedAt: string;
}

export function getZimDir(): string {
  const envDir = process.env.ZIMDIR;
  if (envDir) return envDir;
  
  // Default to ../zims relative to frontend root, or ./zims
  const candidateDir = path.resolve(process.cwd(), "../zims");
  if (!fs.existsSync(candidateDir)) {
    try {
      fs.mkdirSync(candidateDir, { recursive: true });
    } catch {
      // Fallback
      const localDir = path.resolve(process.cwd(), "zims");
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      return localDir;
    }
  }
  return candidateDir;
}

// Global active downloads registry stored on globalThis to survive HMR in dev mode
const globalDownloadsKey = Symbol.for("kiwix_active_downloads");
const globalAbortControllersKey = Symbol.for("kiwix_abort_controllers");

interface GlobalWithDownloads {
  [globalDownloadsKey]?: Map<string, DownloadJob>;
  [globalAbortControllersKey]?: Map<string, () => void>;
}

const g = globalThis as unknown as GlobalWithDownloads;

if (!g[globalDownloadsKey]) {
  g[globalDownloadsKey] = new Map<string, DownloadJob>();
}
if (!g[globalAbortControllersKey]) {
  g[globalAbortControllersKey] = new Map<string, () => void>();
}

export const activeDownloads = g[globalDownloadsKey]!;
const abortControllers = g[globalAbortControllersKey]!;

export function listInstalledZims(): InstalledZim[] {
  const zimDir = getZimDir();
  if (!fs.existsSync(zimDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(zimDir);
    const zims: InstalledZim[] = [];

    for (const f of files) {
      if (f.endsWith(".zim") && !f.endsWith(".part")) {
        const fullPath = path.join(zimDir, f);
        try {
          const stat = fs.statSync(fullPath);
          zims.push({
            fileName: f,
            filePath: fullPath,
            sizeBytes: stat.size,
            sizeFormatted: formatBytes(stat.size),
            modifiedAt: stat.mtime.toISOString()
          });
        } catch (e) {
          console.error(`Error stat-ing file ${f}:`, e);
        }
      }
    }

    return zims.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  } catch (err) {
    console.error("Error reading ZIM directory:", err);
    return [];
  }
}

export function deleteInstalledZim(fileName: string): boolean {
  const zimDir = getZimDir();
  const safeName = path.basename(fileName);
  const fullPath = path.join(zimDir, safeName);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

export function startDownload(url: string, fileName: string, title: string): DownloadJob {
  const safeFileName = path.basename(fileName);
  const zimDir = getZimDir();
  const targetPath = path.join(zimDir, safeFileName);
  const tempPath = path.join(zimDir, `${safeFileName}.part`);

  // Check if file already exists
  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    const completedJob: DownloadJob = {
      id: safeFileName,
      fileName: safeFileName,
      title,
      url,
      downloadedBytes: stat.size,
      totalBytes: stat.size,
      percent: 100,
      speedBytesPerSec: 0,
      status: "completed",
      startTime: Date.now(),
      endTime: Date.now()
    };
    activeDownloads.set(safeFileName, completedJob);
    return completedJob;
  }

  // If already downloading
  if (activeDownloads.has(safeFileName)) {
    const existing = activeDownloads.get(safeFileName)!;
    if (existing.status === "downloading" || existing.status === "queued") {
      return existing;
    }
  }

  const job: DownloadJob = {
    id: safeFileName,
    fileName: safeFileName,
    title,
    url,
    downloadedBytes: 0,
    totalBytes: 0,
    percent: 0,
    speedBytesPerSec: 0,
    status: "queued",
    startTime: Date.now()
  };

  activeDownloads.set(safeFileName, job);

  // Execute download asynchronously
  executeDownloadStream(job, tempPath, targetPath);

  return job;
}

function executeDownloadStream(job: DownloadJob, tempPath: string, targetPath: string) {
  job.status = "downloading";
  const startTime = Date.now();
  let lastTime = startTime;
  let lastBytes = 0;

  const fileStream = fs.createWriteStream(tempPath);

  const fetchWithRedirects = (currentUrl: string, redirectCount = 0) => {
    if (redirectCount > 10) {
      job.status = "failed";
      job.error = "Too many HTTP redirects";
      fileStream.close();
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(currentUrl);
    } catch {
      job.status = "failed";
      job.error = "Invalid URL";
      fileStream.close();
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      return;
    }

    const httpModule = parsedUrl.protocol === "https:" ? https : http;

    const req = httpModule.get(currentUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Dockerized-Kiwix-Server-Installer/1.0)"
      }
    }, (res) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith("http://") && !redirectUrl.startsWith("https://")) {
          redirectUrl = new URL(redirectUrl, currentUrl).toString();
        }
        fetchWithRedirects(redirectUrl, redirectCount + 1);
        return;
      }

      if (res.statusCode !== 200) {
        job.status = "failed";
        job.error = `HTTP Server error ${res.statusCode}: ${res.statusMessage}`;
        fileStream.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        return;
      }

      const contentLength = res.headers["content-length"];
      if (contentLength) {
        job.totalBytes = parseInt(contentLength, 10);
      }

      res.on("data", (chunk: Buffer) => {
        if (job.status === "cancelled") {
          req.destroy();
          fileStream.close();
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          return;
        }

        job.downloadedBytes += chunk.length;
        fileStream.write(chunk);

        // Update calculations
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        if (timeDiff >= 0.5) {
          const bytesDiff = job.downloadedBytes - lastBytes;
          job.speedBytesPerSec = Math.round(bytesDiff / timeDiff);
          lastTime = now;
          lastBytes = job.downloadedBytes;
        }

        if (job.totalBytes > 0) {
          job.percent = Math.min(99, Math.round((job.downloadedBytes / job.totalBytes) * 100));
        }
      });

      res.on("end", () => {
        if (job.status === "cancelled" || job.status === "failed") return;

        fileStream.end(() => {
          try {
            if (fs.existsSync(targetPath)) {
              fs.unlinkSync(targetPath);
            }
            fs.renameSync(tempPath, targetPath);
            job.status = "completed";
            job.percent = 100;
            job.endTime = Date.now();
            job.speedBytesPerSec = 0;
          } catch (renameErr: any) {
            job.status = "failed";
            job.error = `Failed saving completed file: ${renameErr.message}`;
          }
        });
      });

      res.on("error", (err) => {
        job.status = "failed";
        job.error = `Network error: ${err.message}`;
        fileStream.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      });
    });

    req.on("error", (err) => {
      job.status = "failed";
      job.error = `Request error: ${err.message}`;
      fileStream.close();
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    });

    // Store cancel callback
    abortControllers.set(job.id, () => {
      req.destroy();
      job.status = "cancelled";
      fileStream.close();
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    });
  };

  fetchWithRedirects(job.url);
}

export function cancelDownload(fileName: string): boolean {
  const safeName = path.basename(fileName);
  const cancelFn = abortControllers.get(safeName);
  if (cancelFn) {
    cancelFn();
    abortControllers.delete(safeName);
  }
  const job = activeDownloads.get(safeName);
  if (job) {
    job.status = "cancelled";
    return true;
  }
  return false;
}
