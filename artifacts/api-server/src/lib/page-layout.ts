import type { Page } from "playwright";

/** Scale wide documents, without hiding content or removing vertical scrolling. */
export async function fitPageWidth(page: Page, enabled: boolean, width: number): Promise<void> {
  await page.evaluate(({ enabled, width }) => {
    const root = document.documentElement;
    if (!root) return;
    if (root.dataset.runnerOriginalZoom === undefined) {
      root.dataset.runnerOriginalZoom = root.style.zoom;
    }
    const top = window.scrollY;
    root.style.zoom = root.dataset.runnerOriginalZoom;
    const naturalWidth = Math.max(
      width, root.scrollWidth, document.body?.scrollWidth ?? 0,
    );
    if (enabled && naturalWidth > width) {
      const originalZoom = Number.parseFloat(getComputedStyle(root).zoom) || 1;
      root.style.zoom = String(originalZoom * width / naturalWidth);
    }
    window.scrollTo({ left: 0, top, behavior: "instant" });
  }, { enabled, width });
}
