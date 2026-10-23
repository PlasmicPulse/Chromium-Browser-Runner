import { Bookmark as BookmarkIcon, ExternalLink, Trash2 } from "lucide-react";
import type { Bookmark } from "./bookmark-storage";
import "./bookmark-panel.css";

export function BookmarkPanel({
  bookmarks,
  onOpen,
  onRemove,
}: {
  bookmarks: Bookmark[];
  onOpen: (url: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bookmark-panel" data-testid="panel-bookmarks">
      <p className="bookmarks-note">Saved only in this browser.</p>
      {bookmarks.length === 0 ? (
        <p className="bookmarks-empty" data-testid="text-bookmarks-empty">
          No bookmarks yet. Open a page and select the bookmark icon in the address bar.
        </p>
      ) : (
        <ul className="bookmarks-list">
          {bookmarks.map((bookmark) => {
            let hostname = bookmark.url;
            try { hostname = new URL(bookmark.url).hostname; } catch { /* Sanitized on load; keep a readable fallback. */ }
            return (
              <li className="bookmark-row" key={bookmark.id}>
                <button
                  type="button"
                  className="bookmark-open"
                  onClick={() => onOpen(bookmark.url)}
                  aria-label={`Open ${bookmark.title} at ${hostname}`}
                  data-testid={`button-bookmark-open-${bookmark.id}`}
                >
                  <BookmarkIcon size={14} aria-hidden="true" />
                  <span className="bookmark-copy">
                    <strong>{bookmark.title}</strong>
                    <small>{hostname}</small>
                  </span>
                  <ExternalLink className="bookmark-external" size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="bookmark-remove"
                  onClick={() => onRemove(bookmark.id)}
                  aria-label={`Remove ${bookmark.title} bookmark`}
                  title="Remove bookmark"
                  data-testid={`button-bookmark-remove-${bookmark.id}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
