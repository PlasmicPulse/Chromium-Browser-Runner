import { useEffect, useRef, type RefObject } from 'react';
import { remotePoint } from '@/lib/remote-point';

type ScrollInput =
  | { type: 'scroll'; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'pointer'; phase: 'down' | 'up'; x: number; y: number; button: number };

export function useRemoteScroll(
  elementRef: RefObject<HTMLDivElement | null>,
  viewport: { width: number; height: number } | null,
  send: (message: ScrollInput) => void,
) {
  const latest = useRef({ viewport, send });
  latest.current = { viewport, send };

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const localControl = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('[data-local-control]'));
    const wheel = (event: WheelEvent) => {
      const { viewport, send } = latest.current;
      if (!viewport || localControl(event.target)) return;
      // React's delegated wheel listener can be passive, preventing cancellation.
      event.preventDefault();
      const point = remotePoint(element, event.clientX, event.clientY, viewport);
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1;
      send({ type: 'scroll', x: point.x, y: point.y,
        deltaX: event.deltaX * unit, deltaY: event.deltaY * unit });
    };
    let touch: { x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    const start = (event: TouchEvent) => {
      if (!latest.current.viewport || event.touches.length !== 1 || localControl(event.target)) {
        touch = null;
        return;
      }
      const first = event.touches[0];
      touch = { x: first.clientX, y: first.clientY, startX: first.clientX, startY: first.clientY, moved: false };
      element.focus({ preventScroll: true });
    };
    const move = (event: TouchEvent) => {
      const { viewport, send } = latest.current;
      if (!touch || !viewport || event.touches.length !== 1) return;
      event.preventDefault();
      const first = event.touches[0];
      if (!touch.moved && Math.hypot(first.clientX - touch.startX, first.clientY - touch.startY) < 6) return;
      touch.moved = true;
      const point = remotePoint(element, first.clientX, first.clientY, viewport);
      const bounds = element.getBoundingClientRect();
      const scale = Math.min(bounds.width / viewport.width, bounds.height / viewport.height);
      send({ type: 'scroll', x: point.x, y: point.y,
        deltaX: (touch.x - first.clientX) / scale,
        deltaY: (touch.y - first.clientY) / scale });
      touch.x = first.clientX;
      touch.y = first.clientY;
    };
    const end = (event: TouchEvent) => {
      const { viewport, send } = latest.current;
      if (touch && viewport) {
        if (event.cancelable) event.preventDefault();
        const point = remotePoint(element, touch.startX, touch.startY, viewport);
        if (!touch.moved && point.inside) {
          send({ type: 'pointer', phase: 'down', x: point.x, y: point.y, button: 0 });
          send({ type: 'pointer', phase: 'up', x: point.x, y: point.y, button: 0 });
        }
      }
      touch = null;
    };
    const cancel = () => { touch = null; };
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end, { passive: false });
    element.addEventListener('touchcancel', cancel);
    return () => {
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', cancel);
    };
  }, [elementRef]);
}
