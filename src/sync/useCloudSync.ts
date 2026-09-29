import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { getKv, readAllForBackup, setKv } from '../db/repo';
import { useApp } from '../state/AppProvider';
import { sanitizeSettings } from '../state/settings';
import { downloadProgress, reconcileAction, restoreFromCloud, uploadProgress, type CloudSnapshot } from './cloud';

/**
 * Keeps cloud progress in step for a signed-in user:
 * - the first time an account is used on this phone, merge by choice (never silently overwrite);
 * - afterwards, upload whenever the app goes to the background.
 */
export function useCloudSync() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const { refresh, updateSettings } = useApp();
  const userId = user?.id ?? null;
  const linked = useRef<string | null>(null);

  const applyRestore = useCallback(
    async (snapshot: CloudSnapshot) => {
      await restoreFromCloud(db, snapshot);
      await updateSettings(sanitizeSettings(await getKv(db, 'settings')));
      await refresh();
    },
    [db, refresh, updateSettings],
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
        const action = reconcileAction(local.cards.length, local.review_logs.length, remote?.backup ?? null);
        if (action === 'upload') await uploadProgress(db, userId);
        if (action === 'restore' && remote) await applyRestore(remote);
        if (action !== 'ask') return link();
        Alert.alert(
          'Progress found in your account',
          `Your account has ${remote!.backup.cards.length} learned points (saved ${new Date(remote!.updatedAt).toLocaleString()}). This phone has ${local.cards.length}. Which progress do you want to keep?`,
          [
            {
              text: 'This phone',
              onPress: async () => {
                await uploadProgress(db, userId);
                await link();
              },
            },
            {
              text: 'Account',
              onPress: async () => {
                await applyRestore(remote!);
                await link();
              },
            },
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
    const sub = AppState.addEventListener('change', (state) => {
      const id = linked.current;
      if (state === 'background' && id) uploadProgress(db, id).catch((e) => console.warn('Cloud upload failed', e));
    });
    return () => sub.remove();
  }, [db]);
}
