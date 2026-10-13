import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { backupCounts, describeCounts } from '../backup/format';
import { settleWrites } from '../db/pendingWrites';
import { getKv, readAllForBackup, setKv } from '../db/repo';
import { useApp } from '../state/AppProvider';
import { sanitizeSettings } from '../state/settings';
import { useTime } from '../time/TimeProvider';
import { ANKI_MEDIA_NOTE, downloadProgress, reconcileAction, restoreFromCloud, uploadProgress, type CloudSnapshot } from './cloud';

/**
 * Keeps cloud progress in step for a signed-in user:
 * - the first time an account is used on this phone, merge by choice (never silently overwrite);
 * - afterwards, upload whenever the app goes to the background or comes back, if anything changed.
 */
export function useCloudSync() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const { refresh, updateSettings } = useApp();
  const { refresh: refreshTime } = useTime();
  const userId = user?.id ?? null;
  const linked = useRef<string | null>(null);

  const applyRestore = useCallback(
    async (snapshot: CloudSnapshot) => {
      await restoreFromCloud(db, snapshot);
      await updateSettings(sanitizeSettings(await getKv(db, 'settings')));
      await Promise.all([refresh(), refreshTime()]);
      if (backupCounts(snapshot.backup).flashcards > 0) Alert.alert('Progress restored', ANKI_MEDIA_NOTE);
    },
    [db, refresh, refreshTime, updateSettings],
  );

  useEffect(() => {
    if (!userId) {
      linked.current = null;
      return;
    }
    let alive = true;
    (async () => {
      const meta = await getKv(db, 'meta');
      if (meta.syncedUserId === userId) {
        linked.current = userId;
        return;
      }
      try {
        const [local, remote] = await Promise.all([readAllForBackup(db), downloadProgress(userId)]);
        if (!alive) return;
        const link = async () => {
          await setKv(db, 'meta', 'syncedUserId', userId);
          linked.current = userId;
        };
        const action = reconcileAction(local, remote?.backup ?? null);
        if (action === 'upload') await uploadProgress(db, userId, { force: true });
        if (action === 'restore' && remote) await applyRestore(remote);
        if (action !== 'ask') return link();
        // Both phone and account hold progress. Either choice replaces the other copy.
        const choose = (keep: () => Promise<unknown>) => async () => {
          try {
            await keep();
            await link();
          } catch (e) {
            // Not linked, so the question comes back next launch.
            Alert.alert('Sync failed', `${e instanceof Error ? e.message : String(e)}\n\nNothing was changed. Kaeru will ask again next time it opens.`);
          }
        };
        Alert.alert(
          'Progress found in your account',
          `Your account has ${describeCounts(backupCounts(remote!.backup))} (saved ${new Date(remote!.updatedAt).toLocaleString()}). ` +
            `This phone has ${describeCounts(backupCounts(local))}. Which progress do you want to keep? The other copy will be replaced.`,
          [
            { text: 'This phone', onPress: choose(() => uploadProgress(db, userId, { force: true })) },
            { text: 'Account', onPress: choose(() => applyRestore(remote!)) },
          ],
          { cancelable: false },
        );
      } catch (e) {
        // Offline or server trouble: try again next launch; local progress is untouched.
        console.warn('Cloud sync failed', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, userId, applyRestore]);

  useEffect(() => {
    let busy = false;
    const sub = AppState.addEventListener('change', (state) => {
      const id = linked.current;
      if (!id || busy || (state !== 'background' && state !== 'active')) return;
      // Going to the background: upload once the time-in-app entry is saved. Coming back:
      // retry in case iOS suspended the app before the last upload finished.
      busy = true;
      settleWrites()
        .then(() => uploadProgress(db, id))
        .catch((e) => console.warn('Cloud upload failed', e))
        .finally(() => {
          busy = false;
        });
    });
    return () => sub.remove();
  }, [db]);
}
