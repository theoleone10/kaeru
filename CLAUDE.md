@AGENTS.md

## Kaeru notes

- **Backups and cloud sync share one format** (`src/backup/format.ts`, currently v3). `readAllForBackup` / `replaceAllFromBackup` in `src/db/repo.ts` are the only read/restore paths for both the backup file and the Supabase `user_progress` row. Adding a table that holds user progress means:
  1. include it in the backup (bump `BACKUP_FORMAT_VERSION`; older files must still load and keep the phone's own data for sections they lack);
  2. add `sync_state` bump triggers for it in a new migration (`bumpTriggers([...])` in `src/db/migrations.ts`), or cloud sync won't notice changes;
  3. count it in `backupCounts` if it's progress the user would miss, so `reconcileAction` never silently replaces it.
- Anki tables are backed up row for row with ids (`src/anki/backup.ts`); media files are not.
- Tests must pass in any time zone: build dates with local time (`+new Date(y, m, d, h)`), not `Date.UTC`. `npm run test:zones` checks four zones.
- The Anki card WebView runs scripts from imported decks: don't widen its file access (`src/components/AnkiCardView.tsx`).
