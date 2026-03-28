// src/hooks/usePdfExport.ts

import { useEffect, useRef } from 'react';

function useExportEvent(
  eventName: string,
  onTrigger: () => void | Promise<void>,
) {
  const cbRef = useRef(onTrigger);
  // Keep ref current after every render so handler uses fresh data
  useEffect(() => { cbRef.current = onTrigger; });

  useEffect(() => {
    const handler = () => {
      try {
        const result = cbRef.current();
        if (result instanceof Promise) {
          result.catch((err) => console.error(`[${eventName}] failed:`, err));
        }
      } catch (err) {
        console.error(`[${eventName}] failed:`, err);
      }
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName]);
}

export function usePdfExport(onTrigger: () => void | Promise<void>) {
  useExportEvent('mg:export:pdf', onTrigger);
}

export function useCsvExport(onTrigger: () => void | Promise<void>) {
  useExportEvent('mg:export:csv', onTrigger);
}
