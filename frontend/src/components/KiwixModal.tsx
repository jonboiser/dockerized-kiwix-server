import { Show } from "solid-js";

interface KiwixModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl: string;
}

export default function KiwixModal(props: KiwixModalProps) {
  return (
    <Show when={props.isOpen}>
      <div class="modal-overlay" onClick={props.onClose}>
        <div class="modal-content" onClick={(e) => e.stopPropagation()}>
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">📖</span>
              <h3 style="font-size: 16px; font-weight: 700;">Kiwix Reader Interface</h3>
              <code style="font-size: 12px; color: var(--text-dim);">{props.serverUrl}</code>
            </div>

            <div style="display: flex; gap: 10px;">
              <a
                href={props.serverUrl}
                target="_blank"
                rel="noreferrer"
                class="btn btn-secondary"
                style="padding: 6px 12px; font-size: 12px;"
              >
                ↗️ Open in New Tab
              </a>
              <button
                class="btn btn-secondary"
                style="padding: 6px 12px; font-size: 12px;"
                onClick={props.onClose}
              >
                ✕ Close
              </button>
            </div>
          </div>

          <iframe
            src={props.serverUrl}
            class="iframe-viewer"
            title="Kiwix Server Reader"
          />
        </div>
      </div>
    </Show>
  );
}
