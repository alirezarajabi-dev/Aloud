'use strict';
// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const RZip = require('../zip.js');

const toBuf = (parts) => Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));

test('crc32 matches the standard value', () => {
  assert.strictEqual(RZip.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('round trip with Persian names and binary data', () => {
  const audio = new Uint8Array(70000).map((_, i) => (i * 31) % 256);
  const files = [
    { name: 'journal.json', data: new TextEncoder().encode('{"app":"aloud"}') },
    { name: 'audio/2026-11-25_1045 روز اول سر کار [abc].m4a', data: audio, date: new Date(2026, 10, 25, 10, 45) }
  ];
  const out = RZip.unzip(new Uint8Array(toBuf(RZip.zipParts(files))));
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[1].name, files[1].name);
  assert.deepStrictEqual(Buffer.from(out[1].data), Buffer.from(audio));
});

test('backups open with a standard unzip tool', (t) => {
  let hasUnzip = true;
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); } catch (e) { hasUnzip = false; }
  if (!hasUnzip) return t.skip('unzip not installed');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloud-zip-'));
  const zipPath = path.join(dir, 'b.zip');
  fs.writeFileSync(zipPath, toBuf(RZip.zipParts([{ name: 'audio/صدا.m4a', data: new Uint8Array([1, 2, 3, 4]) }])));
  const listing = execFileSync('unzip', ['-t', zipPath]).toString();
  assert.match(listing, /No errors detected/);
});

test('damaged data is detected', () => {
  const buf = toBuf(RZip.zipParts([{ name: 'a.bin', data: new Uint8Array([9, 9, 9, 9, 9]) }]));
  buf[30 + 5 + 2] ^= 0xFF; // header (30) + name "a.bin" (5): flip a byte inside the file data
  assert.throws(() => RZip.unzip(new Uint8Array(buf)), /crc_mismatch/);
  assert.throws(() => RZip.unzip(new Uint8Array([1, 2, 3])), /not_a_zip/);
});

test('reads a compressed zip (like a folder zipped in the Files app) entry by entry', async (t) => {
  let made = true;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aloud-dz-'));
  const zipPath = path.join(dir, 'folder.zip');
  try {
    execFileSync('python3', ['-I', '-c', [
      'import zipfile,sys',
      'z=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED)',
      'z.writestr("Just Press Record/2026-07-16/10-30-00.m4a", bytes(range(256))*400)',
      'z.writestr("Just Press Record/2026-07-18/21-05-10.m4a", b"hello"*1000)',
      'z.writestr("__MACOSX/._x", b"junk")',
      'z.close()'
    ].join('\n'), zipPath]);
  } catch (e) { made = false; }
  if (!made) return t.skip('python3 not available');
  const file = new Blob([fs.readFileSync(zipPath)]);
  const entries = await RZip.blobEntries(file);
  const a = entries.find((e) => e.name.endsWith('10-30-00.m4a'));
  assert.ok(a, 'entry found');
  assert.strictEqual(a.method, 8);
  const blob = await a.blob('audio/mp4');
  assert.strictEqual(blob.size, 256 * 400);
  assert.strictEqual(blob.type, 'audio/mp4');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.strictEqual(bytes[257], 1);
});
