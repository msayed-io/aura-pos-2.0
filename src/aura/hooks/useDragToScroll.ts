import { useRef, useEffect, useCallback } from 'react';

export const useDragToScroll = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = useCallback((e: MouseEvent) => {
    if (ref.current) {
      isDown.current = true;
      ref.current.style.cursor = 'grabbing';
      ref.current.style.userSelect = 'none';
      startX.current = e.pageX - ref.current.offsetLeft;
      scrollLeft.current = ref.current.scrollLeft;
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    if (ref.current) {
      isDown.current = false;
      ref.current.style.cursor = 'grab';
      ref.current.style.userSelect = 'auto';
    }
  }, []);

  const onMouseUp = useCallback(() => {
    if (ref.current) {
      isDown.current = false;
      ref.current.style.cursor = 'grab';
      ref.current.style.userSelect = 'auto';
    }
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDown.current || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX.current) * 2; // The multiplier makes scrolling feel faster
    ref.current.scrollLeft = scrollLeft.current - walk;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (element) {
        // Set initial cursor style
        element.style.cursor = 'grab';

        element.addEventListener('mousedown', onMouseDown as EventListener);
        element.addEventListener('mouseleave', onMouseLeave as EventListener);
        element.addEventListener('mouseup', onMouseUp as EventListener);
        element.addEventListener('mousemove', onMouseMove as EventListener);
        
        return () => {
            element.removeEventListener('mousedown', onMouseDown as EventListener);
            element.removeEventListener('mouseleave', onMouseLeave as EventListener);
            element.removeEventListener('mouseup', onMouseUp as EventListener);
            element.removeEventListener('mousemove', onMouseMove as EventListener);
        };
    }
  }, [onMouseDown, onMouseLeave, onMouseUp, onMouseMove]);

  return ref;
};
