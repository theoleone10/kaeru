/**
 * Writes that must land before something reads the whole database, e.g. the time-in-app
 * entry saved when the app goes to the background, which the cloud upload should include.
 */
const pending = new Set<Promise<unknown>>();

export function trackWrite<T>(write: Promise<T>): Promise<T> {
  pending.add(write);
  write.then(
    () => pending.delete(write),
    () => pending.delete(write),
  );
  return write;
}

/**
 * Wait for tracked writes. The first await lets other listeners for the same event
 * (AppState calls them all synchronously) start their writes before we look.
 */
export async function settleWrites(): Promise<void> {
  await Promise.resolve();
  await Promise.allSettled([...pending]);
}
