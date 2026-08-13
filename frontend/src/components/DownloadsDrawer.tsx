import { For, Show } from "solid-js";
import { DownloadJob } from "../lib/downloads";
import { formatBytes } from "../lib/zimfarm";

interface DownloadsDrawerProps {
  downloads: DownloadJob[];
  onCancelDownload: (fileName: string) => void;
}

export default function DownloadsDrawer(props: DownloadsDrawerProps) {
  const activeJobs = () => props.downloads.filter((d) => d.status === "downloading" || d.status === "queued");

  return (
    <Show when={activeJobs().length > 0}>
      <div class="download-drawer">
        <div class="drawer-header">
          <div class="drawer-title">
            <span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span>
            <span>Active Downloads ({activeJobs().length})</span>
          </div>
        </div>

        <For each={activeJobs()}>
          {(job) => (
            <div class="download-item">
              <div class="download-info">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span class="download-filename">{job.title || job.fileName}</span>
                  <span style="font-size: 13px; font-weight: 700; color: var(--primary);">
                    {job.percent}%
                  </span>
                </div>

                <div class="progress-container" style="margin-top: 4px;">
                  <div class="progress-fill" style={{ width: `${job.percent}%` }}></div>
                </div>

                <div class="download-meta">
                  <span>Downloaded: {formatBytes(job.downloadedBytes)} / {formatBytes(job.totalBytes)}</span>
                  <span>Speed: {job.speedBytesPerSec ? `${formatBytes(job.speedBytesPerSec)}/s` : "Calculating..."}</span>
                  <span>Status: {job.status}</span>
                </div>
              </div>

              <button
                class="btn btn-danger"
                style="padding: 6px 12px; font-size: 12px; flex-shrink: 0;"
                onClick={() => props.onCancelDownload(job.fileName)}
              >
                Cancel
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
