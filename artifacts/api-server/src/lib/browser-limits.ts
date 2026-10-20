const MAX_ACTIVE_BROWSERS = 2;
let activeBrowsers = 0;

export function acquireBrowserSlot(): boolean {
  if (activeBrowsers >= MAX_ACTIVE_BROWSERS) return false;
  activeBrowsers += 1;
  return true;
}

export function releaseBrowserSlot(): void {
  activeBrowsers = Math.max(0, activeBrowsers - 1);
}
