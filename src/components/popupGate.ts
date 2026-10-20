import { useSyncExternalStore } from 'react';

// Only one Modal can be up at a time on iOS: the day-done popup waits while a time-goal popup is open.
let goalPopupOpen = false;
const listeners = new Set<() => void>();

export function setGoalPopupOpen(open: boolean): void {
  if (open === goalPopupOpen) return;
  goalPopupOpen = open;
  for (const l of listeners) l();
}

export function useGoalPopupOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => goalPopupOpen,
  );
}
