/** Coordinates inside the aspect-preserved image, excluding letterbox margins. */
export function remotePoint(
  element: HTMLElement, clientX: number, clientY: number,
  viewport: { width: number; height: number },
) {
  const bounds = element.getBoundingClientRect();
  const scale = Math.min(bounds.width / viewport.width, bounds.height / viewport.height);
  const width = viewport.width * scale;
  const height = viewport.height * scale;
  const left = bounds.left + (bounds.width - width) / 2;
  const top = bounds.top + (bounds.height - height) / 2;
  return {
    x: Math.max(0, Math.min(1, (clientX - left) / width)),
    y: Math.max(0, Math.min(1, (clientY - top) / height)),
    inside: clientX >= left && clientX <= left + width && clientY >= top && clientY <= top + height,
  };
}
