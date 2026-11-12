import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate } from '@/db/migrations';
import { getRunning, startTimer } from '@/time/repo';
import { openNodeDb } from './helpers/nodeDb';

// An in-memory Documents/timer-inbox, written the way the Swift actions write it.
const mockFiles = new Map<string, string>();
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-file-system', () => {
  class MockFile {
    name: string;
    constructor(_dir: unknown, name: string) {
      this.name = name;
    }
    text() {
      return Promise.resolve(mockFiles.get(this.name) ?? '');
    }
    delete() {
      mockFiles.delete(this.name);
    }
  }
  class MockDirectory {
    get exists() {
      return mockFiles.size > 0;
    }
    list() {
      return [...mockFiles.keys()].sort().map((n) => new MockFile(null, n));
    }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { document: '/' } };
});

// Imported after the mocks.
// eslint-disable-next-line import/first
import { drainShortcutInbox, onInboxApplied } from '@/time/shortcutInbox';

const T = +new Date(2026, 9, 1, 9);
const MIN = 60 * 1000;

async function freshDb(): Promise<SQLiteDatabase> {
  const db = openNodeDb();
  await migrate(db);
  return db;
}

describe('drainShortcutInbox', () => {
  beforeEach(() => mockFiles.clear());

  it('makes a second caller wait until the first has applied the stop', async () => {
    const db = await freshDb();
    await startTimer(db, 'Immersion', T);
    mockFiles.set('a.json', JSON.stringify({ action: 'stop', at: T + 30 * MIN }));
    // The timer screen and the notification planner drain at the same moment.
    const [first, second] = await Promise.all([drainShortcutInbox(db), drainShortcutInbox(db).then(() => getRunning(db))]);
    expect(first).toBe(true);
    // The planner reads the timer only after the stop is in the database.
    expect(second).toBeNull();
  });

  it('tells listeners when queued actions changed the timer', async () => {
    const db = await freshDb();
    const heard = jest.fn();
    const off = onInboxApplied(heard);
    await drainShortcutInbox(db);
    expect(heard).not.toHaveBeenCalled();
    mockFiles.set('a.json', JSON.stringify({ action: 'start', activity: 'Study', at: T }));
    await drainShortcutInbox(db);
    expect(heard).toHaveBeenCalledTimes(1);
    off();
  });
});
