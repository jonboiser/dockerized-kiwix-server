import { createSignal, onMount, onCleanup, Show, Switch, Match } from "solid-js";
import Header from "../components/Header";
import CatalogStore from "../components/CatalogStore";
import InstalledLibrary from "../components/InstalledLibrary";
import DownloadsDrawer from "../components/DownloadsDrawer";
import KiwixModal from "../components/KiwixModal";
import { ZimEntry } from "../lib/zimfarm";
import { DownloadJob, InstalledZim } from "../lib/downloads";

export default function Home() {
  const [activeTab, setActiveTab] = createSignal<"catalog" | "installed" | "downloads">("catalog");
  const [serverOnline, setServerOnline] = createSignal(false);
  const [kiwixUrl, setKiwixUrl] = createSignal("http://localhost:8080");

  const [installedZims, setInstalledZims] = createSignal<InstalledZim[]>([]);
  const [totalSizeBytes, setTotalSizeBytes] = createSignal(0);
  const [totalSizeFormatted, setTotalSizeFormatted] = createSignal("0 B");
  const [zimDir, setZimDir] = createSignal("/zims");

  const [activeDownloads, setActiveDownloads] = createSignal<DownloadJob[]>([]);
  const [isViewerOpen, setIsViewerOpen] = createSignal(false);

  let pollInterval: any;

  const checkServerStatus = async () => {
    try {
      const res = await fetch("/api/server-status");
      const data = await res.json();
      setServerOnline(data.online);
      if (data.kiwixUrl) setKiwixUrl(data.kiwixUrl);
    } catch {
      setServerOnline(false);
    }
  };

  const loadInstalledZims = async () => {
    try {
      const res = await fetch("/api/zims");
      const data = await res.json();
      setInstalledZims(data.zims || []);
      setTotalSizeBytes(data.totalSizeBytes || 0);
      setTotalSizeFormatted(data.totalSizeFormatted || "0 B");
      if (data.zimDir) setZimDir(data.zimDir);
    } catch (err) {
      console.error("Error loading installed ZIMs:", err);
    }
  };

  const pollDownloads = async () => {
    try {
      const res = await fetch("/api/downloads");
      const data = await res.json();
      const jobs: DownloadJob[] = data.downloads || [];
      setActiveDownloads(jobs);

      // If any download completed, refresh installed zims list
      const completedAny = jobs.some((j) => j.status === "completed");
      if (completedAny) {
        loadInstalledZims();
      }
    } catch (err) {
      console.error("Error polling downloads:", err);
    }
  };

  onMount(() => {
    checkServerStatus();
    loadInstalledZims();
    pollDownloads();

    // Set up polling every 2 seconds
    pollInterval = setInterval(() => {
      checkServerStatus();
      pollDownloads();
    }, 2000);
  });

  onCleanup(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  const handleTriggerDownload = async (entry: ZimEntry) => {
    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: entry.downloadUrl,
          fileName: entry.fileName,
          title: entry.title
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        alert(`Download failed to start: ${errData.error || "Unknown error"}`);
        return;
      }

      // Refresh downloads state immediately
      pollDownloads();
    } catch (err: any) {
      alert(`Download error: ${err.message}`);
    }
  };

  const handleDeleteZim = async (fileName: string) => {
    try {
      const res = await fetch("/api/zims", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName })
      });

      if (res.ok) {
        loadInstalledZims();
      } else {
        alert("Failed to delete ZIM file");
      }
    } catch (err: any) {
      alert(`Error deleting ZIM: ${err.message}`);
    }
  };

  const handleCancelDownload = async (fileName: string) => {
    try {
      await fetch("/api/downloads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName })
      });
      pollDownloads();
    } catch (err: any) {
      console.error("Error cancelling download:", err);
    }
  };

  return (
    <div class="app-container">
      <Header
        activeTab={activeTab()}
        setActiveTab={setActiveTab}
        serverOnline={serverOnline()}
        installedCount={installedZims().length}
        totalSizeFormatted={totalSizeFormatted()}
        activeDownloadsCount={
          activeDownloads().filter((d) => d.status === "downloading" || d.status === "queued").length
        }
        onOpenViewer={() => setIsViewerOpen(true)}
      />

      <main>
        <Switch>
          <Match when={activeTab() === "catalog"}>
            <CatalogStore
              installedZims={installedZims()}
              activeDownloads={activeDownloads()}
              onTriggerDownload={handleTriggerDownload}
            />
          </Match>

          <Match when={activeTab() === "installed"}>
            <InstalledLibrary
              installedZims={installedZims()}
              totalSizeBytes={totalSizeBytes()}
              totalSizeFormatted={totalSizeFormatted()}
              zimDir={zimDir()}
              onDeleteZim={handleDeleteZim}
              onRefresh={loadInstalledZims}
              onOpenViewer={() => setIsViewerOpen(true)}
            />
          </Match>

          <Match when={activeTab() === "downloads"}>
            <div>
              <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Download Queue & History</h2>
              <DownloadsDrawer
                downloads={activeDownloads()}
                onCancelDownload={handleCancelDownload}
              />
            </div>
          </Match>
        </Switch>
      </main>

      <DownloadsDrawer
        downloads={activeDownloads()}
        onCancelDownload={handleCancelDownload}
      />

      <KiwixModal
        isOpen={isViewerOpen()}
        onClose={() => setIsViewerOpen(false)}
        serverUrl={kiwixUrl()}
      />
    </div>
  );
}
