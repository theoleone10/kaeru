import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate } from '@/db/migrations';
import type { Activity, TimeEntry } from '@/time/model';
import { getRunning } from '@/time/repo';
import { applyInboxCommand, parseInboxCommand, timerStateForShortcuts } from '@/time/shortcutInbox';
import { openNodeDb } from './helpers/nodeDb';

const T = Date.UTC(2026, 9, 1, 9); // 1 Oct 2026 09:00
const MIN = 60 * 1000;

async function freshDb(): Promise<SQLiteDatabase> {
  const db = openNodeDb();
  await migrate(db);
  return db;
}

const entries = (db: SQLiteDatabase) =>
  db.getAllAsync<TimeEntry & { name: string }>('SELECT e.*, a.name FROM time_entries e JOIN activities a ON a.id = e.activity_id ORDER BY e.started_at');

/** Apply raw JSON the way the Swift actions write it. */
async function apply(db: SQLiteDatabase, json: object) {
  const parsed = parseInboxCommand(JSON.stringify(json));
  if (!parsed) throw new Error('did not parse');
  await applyInboxCommand(db, parsed);
}

describe('parseInboxCommand', () => {
  it('reads the commands the Shortcuts actions write', () => {
    expect(parseInboxCommand('{"action":"start","activity":"Study","note":"Ch. 3","at":1759309200000}')).toEqual({
      command: { kind: 'start', activity: 'Study', note: 'Ch. 3' },
      at: 1759309200000,
    });
    expect(parseInboxCommand('{"action":"stop","at":1759309200000}')).toEqual({ command: { kind: 'stop' }, at: 1759309200000 });
    expect(parseInboxCommand('{"action":"toggle","activity":"Immersion","at":1}')?.command).toEqual({ kind: 'toggle', activity: 'Immersion', note: '' });
  });

  it('rejects anything malformed', () => {
    expect(parseInboxCommand('not json')).toBeNull();
    expect(parseInboxCommand('null')).toBeNull();
    expect(parseInboxCommand('{"action":"start"}')).toBeNull();
    expect(parseInboxCommand('{"action":"dance","at":1}')).toBeNull();
    expect(parseInboxCommand('{"action":"start","at":"soon"}')).toBeNull();
  });
});

describe('applyInboxCommand', () => {
  it('starts and stops at the times the actions ran, not when the app applies them', async () => {
    const db = await freshDb();
    await apply(db, { action: 'start', activity: 'Immersion', note: 'Anime', at: T });
    await apply(db, { action: 'stop', at: T + 30 * MIN });
    expect(await entries(db)).toMatchObject([{ name: 'Immersion', started_at: T, ended_at: T + 30 * MIN, note: 'Anime', source: 'shortcut' }]);
  });

  it('switching activity ends the previous timer at the switch', async () => {
    const db = await freshDb();
    await apply(db, { action: 'start', activity: 'Immersion', at: T });
    await apply(db, { action: 'start', activity: 'Study', at: T + 10 * MIN });
    expect(await entries(db)).toMatchObject([
      { name: 'Immersion', ended_at: T + 10 * MIN },
      { name: 'Study', started_at: T + 10 * MIN, ended_at: null },
    ]);
  });

  it('toggle starts, then stops the same activity (case-insensitively)', async () => {
    const db = await freshDb();
    await apply(db, { action: 'toggle', activity: 'study', at: T });
    expect((await getRunning(db))?.started_at).toBe(T);
    await apply(db, { action: 'toggle', activity: 'STUDY', at: T + 5 * MIN });
    expect(await getRunning(db)).toBeNull();
    expect(await entries(db)).toHaveLength(1);
  });

  it('creates an activity that does not exist yet', async () => {
    const db = await freshDb();
    await apply(db, { action: 'start', activity: 'Podcasts', at: T });
    expect(await entries(db)).toMatchObject([{ name: 'Podcasts', ended_at: null }]);
  });

  it('never ends a timer before it started (one started in the app after the action ran)', async () => {
    const db = await freshDb();
    await apply(db, { action: 'start', activity: 'Study', at: T + 10 * MIN });
    await apply(db, { action: 'stop', at: T });
    const [e] = await entries(db);
    expect(e.ended_at).toBe(T + 10 * MIN);
  });

  it('a stop with nothing running does nothing', async () => {
    const db = await freshDb();
    await apply(db, { action: 'stop', at: T });
    expect(await entries(db)).toHaveLength(0);
  });
});

describe('timerStateForShortcuts', () => {
  const acts: Activity[] = [
    { id: 1, name: 'Immersion', color: '#000', position: 0, archived: 0 },
    { id: 2, name: 'Study', color: '#000', position: 1, archived: 0 },
    { id: 3, name: 'Old', color: '#000', position: 2, archived: 1 },
  ];

  it('lists visible activities and names the running one', () => {
    const running: TimeEntry = { id: 9, activity_id: 2, started_at: T, ended_at: null, note: '', source: 'timer' };
    expect(timerStateForShortcuts(acts, running)).toEqual({ activities: ['Immersion', 'Study'], running: 'Study' });
    expect(timerStateForShortcuts(acts, null).running).toBeNull();
  });
});
