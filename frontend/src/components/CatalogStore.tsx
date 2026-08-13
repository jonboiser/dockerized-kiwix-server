import { createSignal, createEffect, For, Show } from "solid-js";
import { ZimEntry, formatBytes } from "../lib/zimfarm";
import { DownloadJob, InstalledZim } from "../lib/downloads";

interface CatalogStoreProps {
  installedZims: InstalledZim[];
  activeDownloads: DownloadJob[];
  onTriggerDownload: (entry: ZimEntry) => void;
}

const CATEGORIES = [
  { id: "all", label: "All Categories" },
  { id: "wikipedia", label: "Wikipedia" },
  { id: "technology", label: "Technology & Code" },
  { id: "education", label: "Education (TED/Khan)" },
  { id: "books", label: "Books & Literature" },
  { id: "medicine", label: "Medicine & Health" },
  { id: "dictionary", label: "Dictionaries" }
];

const LANGUAGES = [
  { code: "", name: "All Languages" },
  { code: "eng", name: "English" },
  { code: "spa", name: "Spanish" },
  { code: "fra", name: "French" },
  { code: "deu", name: "German" },
  { code: "zho", name: "Chinese" },
  { code: "rus", name: "Russian" },
  { code: "ara", name: "Arabic" },
  { code: "por", name: "Portuguese" },
  { code: "ita", name: "Italian" }
];

export default function CatalogStore(props: CatalogStoreProps) {
  const [entries, setEntries] = createSignal<ZimEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const [searchQuery, setSearchQuery] = createSignal("");
  const [selectedLang, setSelectedLang] = createSignal("");
  const [selectedCategory, setSelectedCategory] = createSignal("all");

  const fetchCatalog = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/catalog?count=120`;
      if (selectedLang()) url += `&lang=${selectedLang()}`;
      if (selectedCategory() && selectedCategory() !== "all") {
        url += `&category=${selectedCategory()}`;
      }
      if (searchQuery().trim()) {
        url += `&q=${encodeURIComponent(searchQuery().trim())}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load Zimfarm catalog");
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (err: any) {
      setError(err.message || "Error loading catalog");
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    // Re-fetch when lang or category changes
    selectedLang();
    selectedCategory();
    fetchCatalog();
  });

  const handleSearchSubmit = (e: Event) => {
    e.preventDefault();
    fetchCatalog();
  };

  const getInstalledState = (fileName: string) => {
    return props.installedZims.some((z) => z.fileName === fileName);
  };

  const getActiveDownload = (fileName: string) => {
    return props.activeDownloads.find((d) => d.fileName === fileName);
  };

  return (
    <div>
      <form class="filter-bar" onSubmit={handleSearchSubmit}>
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input
            type="text"
            class="input-field"
            placeholder="Search Wikipedia, DevDocs, StackOverflow, Gutenberg..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
        </div>

        <select
          class="select-field"
          value={selectedLang()}
          onChange={(e) => setSelectedLang(e.currentTarget.value)}
        >
          <For each={LANGUAGES}>
            {(lang) => <option value={lang.code}>{lang.name}</option>}
          </For>
        </select>

        <button type="submit" class="btn btn-primary">
          Filter Catalog
        </button>
      </form>

      <div class="category-chips">
        <For each={CATEGORIES}>
          {(cat) => (
            <button
              class={`chip-btn ${selectedCategory() === cat.id ? "active" : ""}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          )}
        </For>
      </div>

      <Show when={loading()}>
        <div class="loading-box">
          <div class="spinner"></div>
          <p>Fetching Zimfarm OPDS Catalog...</p>
        </div>
      </Show>

      <Show when={!loading() && error()}>
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <h3>Catalog unavailable</h3>
          <p>{error()}</p>
          <button class="btn btn-secondary" style="margin-top: 14px;" onClick={fetchCatalog}>
            Retry
          </button>
        </div>
      </Show>

      <Show when={!loading() && !error() && entries().length === 0}>
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No ZIM packages found</h3>
          <p>Try adjusting your search query or language filter.</p>
        </div>
      </Show>

      <Show when={!loading() && !error() && entries().length > 0}>
        <div class="cards-grid">
          <For each={entries()}>
            {(entry) => {
              const isInstalled = () => getInstalledState(entry.fileName);
              const downloadJob = () => getActiveDownload(entry.fileName);

              return (
                <div class="card">
                  <div>
                    <div class="card-header">
                      <Show
                        when={entry.iconUrl}
                        fallback={
                          <div class="card-icon">
                            {entry.title.slice(0, 2).toUpperCase()}
                          </div>
                        }
                      >
                        <img
                          src={entry.iconUrl}
                          alt={entry.title}
                          class="card-icon"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = "none";
                          }}
                        />
                      </Show>

                      <div>
                        <h3 class="card-title">{entry.title}</h3>
                        <span class="card-publisher">{entry.name || entry.fileName}</span>
                      </div>
                    </div>

                    <div class="card-meta-row">
                      <span class="meta-tag lang">{entry.languageName}</span>
                      <span class="meta-tag size">{entry.sizeFormatted}</span>
                      <span class="meta-tag">{entry.category}</span>
                    </div>

                    <p class="card-summary">{entry.summary || "No description provided."}</p>
                  </div>

                  <div>
                    <Show when={downloadJob()}>
                      {(job) => (
                        <div>
                          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; font-weight: 600;">
                            <span>
                              {job().status === "completed"
                                ? "Installed!"
                                : job().status === "downloading"
                                ? `Downloading (${job().percent}%)`
                                : job().status}
                            </span>
                            <span style="font-family: var(--font-mono);">
                              {job().speedBytesPerSec
                                ? `${formatBytes(job().speedBytesPerSec)}/s`
                                : ""}
                            </span>
                          </div>

                          <div class="progress-container">
                            <div
                              class="progress-fill"
                              style={{ width: `${job().percent}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </Show>

                    <Show when={!downloadJob()}>
                      <Show
                        when={isInstalled()}
                        fallback={
                          <button
                            class="btn btn-primary"
                            style="width: 100%;"
                            onClick={() => props.onTriggerDownload(entry)}
                          >
                            ⬇️ Install ZIM ({entry.sizeFormatted})
                          </button>
                        }
                      >
                        <button class="btn btn-success" style="width: 100%;" disabled>
                          ✓ Installed in /zims
                        </button>
                      </Show>
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
