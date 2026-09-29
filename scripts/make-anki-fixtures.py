"""Generate tiny Anki packages for tests/anki.test.ts.

  pip install zstandard && python3 scripts/make-anki-fixtures.py

legacy.apkg  – Anki ≤ 2.1.49 layout: schema 11 (note types / decks as JSON in `col`),
               collection.anki2, JSON media map, plain media files.
modern.apkg  – Anki ≥ 2.1.50 default: schema 18 (notetypes / fields / templates / decks
               tables with protobuf config), zstd-compressed collection.anki21b,
               zstd'd protobuf media map, zstd'd media files, plus the placeholder
               collection.anki2 real exports include.
Both hold the same content, so the tests can assert identical results.
"""
import io, json, os, sqlite3, tempfile, zipfile
import zstandard

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
CRT = 1767225600  # 2026-01-01 00:00 UTC

BASIC_ID, CLOZE_ID = 1700000000001, 1700000000002
VOCAB, GRAMMAR = 1700000000100, 1700000000200
BASIC = dict(id=BASIC_ID, name='Basic (and reversed card)', type=0, css='.card { font-size: 30px; }',
             flds=['Front', 'Back'],
             tmpls=[('Card 1', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'),
                    ('Card 2', '{{Back}}', '{{FrontSide}}<hr id=answer>{{Front}}')])
CLOZE = dict(id=CLOZE_ID, name='Cloze', type=1, css='.cloze { color: blue; }',
             flds=['Text', 'Extra'],
             tmpls=[('Cloze', '{{cloze:Text}}', '{{cloze:Text}}<br>{{Extra}}')])
DECKS = [(1, 'Default'), (VOCAB, 'Japanese::Vocab'), (GRAMMAR, 'Japanese::Grammar')]
NOTES = [  # id, guid, mid, fields, tags
    (1, 'g-basic-1', BASIC_ID, ['猫[ねこ]', 'cat [sound:neko.mp3]'], ' animal '),
    (2, 'g-cloze-1', CLOZE_ID, ['{{c1::猫}}が{{c2::好き::like}}です', ''], ''),
]
LEARN_DUE = CRT + 200 * 86400 + 600
CARDS = [  # id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, odue, odid, data
    (11, 1, VOCAB, 0, 2, 2, 100, 10, 2500, 5, 1, 0, 0, ''),
    (12, 1, VOCAB, 1, 0, 0, 7, 0, 0, 0, 0, 0, 0, ''),
    (21, 2, GRAMMAR, 0, 2, -1, 50, 3, 1300, 4, 2, 0, 0, '{"s":4.5,"d":7.2}'),
    (22, 2, GRAMMAR, 1, 1, 1, LEARN_DUE, 0, 0, 1, 0, 0, 0, ''),
]
REVLOG = [  # id(ms), cid, ease, ivl, lastIvl, factor, time, type
    ((CRT + 60 * 86400) * 1000, 11, 3, 4, 1, 2500, 5000, 1),
    ((CRT + 80 * 86400) * 1000, 11, 1, -600, 4, 2300, 9000, 1),
    ((CRT + 90 * 86400) * 1000, 11, 0, 10, 4, 2500, 0, 4),  # manual reschedule: not an answer
    ((CRT + 47 * 86400) * 1000, 21, 3, 3, 1, 1300, 4000, 1),
]
MEDIA = {'neko.mp3': b'ID3-fake-audio'}

COMMON_SQL = '''
CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text,
  flds text, sfld integer, csum integer, flags integer, data text);
CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer,
  type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer,
  left integer, odue integer, odid integer, flags integer, data text);
CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer,
  lastIvl integer, factor integer, time integer, type integer);
'''


def fill_common(db):
    for nid, guid, mid, flds, tags in NOTES:
        db.execute('INSERT INTO notes VALUES (?,?,?,0,0,?,?,0,0,0,"")', (nid, guid, mid, tags, '\x1f'.join(flds)))
    for c in CARDS:
        cid, nid, did, ord_, typ, queue, due, ivl, factor, reps, lapses, odue, odid, data = c
        db.execute('INSERT INTO cards VALUES (?,?,?,?,0,0,?,?,?,?,?,?,?,0,?,?,0,?)',
                   (cid, nid, did, ord_, typ, queue, due, ivl, factor, reps, lapses, odue, odid, data))
    for r in REVLOG:
        rid, cid, ease, ivl, last, factor, t, typ = r
        db.execute('INSERT INTO revlog VALUES (?,?,0,?,?,?,?,?,?)', (rid, cid, ease, ivl, last, factor, t, typ))


def sqlite_bytes(build):
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    os.remove(path)
    db = sqlite3.connect(path)
    build(db)
    db.commit()
    db.close()
    data = open(path, 'rb').read()
    os.remove(path)
    return data


def legacy():
    def build(db):
        db.executescript(COMMON_SQL + '''CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer,
          ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);''')
        models = {str(m['id']): {'id': m['id'], 'name': m['name'], 'type': m['type'], 'css': m['css'],
                                 'flds': [{'name': f, 'ord': i} for i, f in enumerate(m['flds'])],
                                 'tmpls': [{'name': n, 'ord': i, 'qfmt': q, 'afmt': a} for i, (n, q, a) in enumerate(m['tmpls'])]}
                  for m in (BASIC, CLOZE)}
        decks = {str(i): {'id': i, 'name': n} for i, n in DECKS}
        db.execute('INSERT INTO col VALUES (1,?,0,0,11,0,0,0,"{}",?,?,"{}","{}")', (CRT, json.dumps(models), json.dumps(decks)))
        fill_common(db)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('collection.anki2', sqlite_bytes(build))
        names = list(MEDIA)
        for i, n in enumerate(names):
            z.writestr(str(i), MEDIA[n])
        z.writestr('media', json.dumps({str(i): n for i, n in enumerate(names)}))
    return buf.getvalue()


# --- minimal protobuf encoding ---
def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7f
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def pb_field(num, value):
    if isinstance(value, int):
        return varint(num << 3) + varint(value)
    data = value.encode() if isinstance(value, str) else value
    return varint((num << 3) | 2) + varint(len(data)) + data


def modern():
    zc = zstandard.ZstdCompressor()

    def build(db):
        db.executescript(COMMON_SQL + '''
        CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer,
          usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
        CREATE TABLE notetypes (id integer primary key, name text, mtime_secs integer, usn integer, config blob);
        CREATE TABLE fields (ntid integer, ord integer, name text, config blob, primary key (ntid, ord));
        CREATE TABLE templates (ntid integer, ord integer, name text, mtime_secs integer, usn integer, config blob,
          primary key (ntid, ord));
        CREATE TABLE decks (id integer primary key, name text, mtime_secs integer, usn integer, common blob, kind blob);''')
        db.execute('INSERT INTO col VALUES (1,?,0,0,18,0,0,0,"","","","","")', (CRT,))
        for m in (BASIC, CLOZE):
            cfg = pb_field(1, m['type']) + pb_field(2, 0) + pb_field(3, m['css'])
            db.execute('INSERT INTO notetypes VALUES (?,?,0,0,?)', (m['id'], m['name'], cfg))
            for i, f in enumerate(m['flds']):
                db.execute('INSERT INTO fields VALUES (?,?,?,?)', (m['id'], i, f, b''))
            for i, (n, q, a) in enumerate(m['tmpls']):
                db.execute('INSERT INTO templates VALUES (?,?,?,0,0,?)', (m['id'], i, n, pb_field(1, q) + pb_field(2, a)))
        for i, n in DECKS:
            db.execute('INSERT INTO decks VALUES (?,?,0,0,?,?)', (i, n.replace('::', '\x1f'), b'', b''))
        fill_common(db)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('collection.anki2', sqlite_bytes(lambda db: db.executescript(
            'CREATE TABLE col (id integer primary key, crt integer, models text, decks text); INSERT INTO col VALUES (1, 0, "{}", "{}");'
            + COMMON_SQL)))  # placeholder, like real exports
        z.writestr('collection.anki21b', zc.compress(sqlite_bytes(build)))
        names = list(MEDIA)
        entries = b''
        for i, n in enumerate(names):
            z.writestr(str(i), zc.compress(MEDIA[n]))
            entries += pb_field(1, pb_field(1, n) + pb_field(2, len(MEDIA[n])))
        z.writestr('media', zc.compress(entries))
        z.writestr('meta', pb_field(1, 3))
    return buf.getvalue()


os.makedirs(OUT, exist_ok=True)
open(os.path.join(OUT, 'legacy.apkg'), 'wb').write(legacy())
open(os.path.join(OUT, 'modern.apkg'), 'wb').write(modern())
print('wrote', OUT)
