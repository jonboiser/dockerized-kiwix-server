import { createSignal } from "solid-js";

interface HeaderProps {
  activeTab: "catalog" | "installed" | "downloads";
  setActiveTab: (tab: "catalog" | "installed" | "downloads") => void;
  serverOnline: boolean;
  installedCount: number;
  totalSizeFormatted: string;
  activeDownloadsCount: number;
  onOpenViewer: () => void;
}

export default function Header(props: HeaderProps) {
  return (
    <header class="header">
      <div class="header-top">
        <div class="logo-brand">
          <div class="logo-icon">📚</div>
          <div>
            <h1 class="brand-title">Kiwix Zimfarm Hub</h1>
            <p class="brand-subtitle">Download & Serve Offline Knowledge Libraries</p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="server-badge">
            <span class={`dot-indicator ${props.serverOnline ? "dot-online" : "dot-offline"}`}></span>
            <span>Kiwix Server: {props.serverOnline ? "Online (8080)" : "Connecting..."}</span>
          </div>

          <button class="btn btn-secondary" onClick={props.onOpenViewer}>
            🌐 Open Kiwix Reader
          </button>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <nav class="nav-tabs">
          <button
            class={`tab-btn ${props.activeTab === "catalog" ? "active" : ""}`}
            onClick={() => props.setActiveTab("catalog")}
          >
            📦 Zimfarm Store
          </button>
          <button
            class={`tab-btn ${props.activeTab === "installed" ? "active" : ""}`}
            onClick={() => props.setActiveTab("installed")}
          >
            💾 Installed Library
            <span class="tab-badge">{props.installedCount}</span>
          </button>
          <button
            class={`tab-btn ${props.activeTab === "downloads" ? "active" : ""}`}
            onClick={() => props.setActiveTab("downloads")}
          >
            ⚡ Active Downloads
            {props.activeDownloadsCount > 0 && (
              <span class="tab-badge" style="background: var(--accent-emerald);">
                {props.activeDownloadsCount}
              </span>
            )}
          </button>
        </nav>

        <div style="font-size: 13px; color: var(--text-muted); font-family: var(--font-mono);">
          Storage Used: <strong style="color: var(--text-main);">{props.totalSizeFormatted}</strong>
        </div>
      </div>
    </header>
  );
}
