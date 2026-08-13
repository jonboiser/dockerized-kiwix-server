import { For, Show } from "solid-js";
import { InstalledZim } from "../lib/downloads";

interface InstalledLibraryProps {
  installedZims: InstalledZim[];
  totalSizeBytes: number;
  totalSizeFormatted: string;
  zimDir: string;
  onDeleteZim: (fileName: string) => void;
  onRefresh: () => void;
  onOpenViewer: () => void;
}

export default function InstalledLibrary(props: InstalledLibraryProps) {
  return (
    <div>
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 700;">Installed ZIM Archives</h2>
          <p style="font-size: 13px; color: var(--text-muted);">
            Mounted volume path: <code style="font-family: var(--font-mono); color: var(--primary);">{props.zimDir}</code>
          </p>
        </div>

        <div style="display: flex; gap: 10px;">
          <button class="btn btn-secondary" onClick={props.onRefresh}>
            🔄 Refresh List
          </button>
          <button class="btn btn-primary" onClick={props.onOpenViewer}>
            🚀 Launch Kiwix Reader
          </button>
        </div>
      </div>

      <Show
        when={props.installedZims.length > 0}
        fallback={
          <div class="empty-state">
            <div class="empty-icon">📂</div>
            <h3>No ZIM files installed yet</h3>
            <p>Go to the Zimfarm Store tab to browse and download offline knowledge packages.</p>
          </div>
        }
      >
        <div class="table-container">
          <table class="zim-table">
            <thead>
              <tr>
                <th>ZIM File Name</th>
                <th>Size</th>
                <th>Last Modified</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.installedZims}>
                {(zim) => (
                  <tr>
                    <td>
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 20px;">📄</span>
                        <div>
                          <div style="font-weight: 600; font-family: var(--font-mono);">{zim.fileName}</div>
                          <div style="font-size: 11px; color: var(--text-dim);">{zim.filePath}</div>
                        </div>
                      </div>
                    </td>
                    <td style="font-family: var(--font-mono); font-weight: 600;">
                      {zim.sizeFormatted}
                    </td>
                    <td style="color: var(--text-muted); font-size: 13px;">
                      {new Date(zim.modifiedAt).toLocaleString()}
                    </td>
                    <td>
                      <div style="display: flex; gap: 8px;">
                        <button
                          class="btn btn-secondary"
                          style="padding: 6px 12px; font-size: 12px;"
                          onClick={props.onOpenViewer}
                        >
                          Read in Kiwix
                        </button>
                        <button
                          class="btn btn-danger"
                          style="padding: 6px 12px; font-size: 12px;"
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete ${zim.fileName}?`)) {
                              props.onDeleteZim(zim.fileName);
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
