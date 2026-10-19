import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const apkPath = path.resolve(root, process.argv[2] || 'downloads/zasvet-android.apk');
const apk = await readFile(apkPath);

// Read ZIP metadata rather than treating APK signature blocks as ZIP entries.
let end = apk.length - 22;
for (; end >= Math.max(0, apk.length - 65557); end--) {
  if (apk.readUInt32LE(end) === 0x06054b50 && end + 22 + apk.readUInt16LE(end + 20) === apk.length) break;
}
assert.ok(end >= 0, 'APK is missing a ZIP directory');
const count = apk.readUInt16LE(end + 10);
let offset = apk.readUInt32LE(end + 16);
const entries = new Map();
for (let i = 0; i < count; i++) {
  assert.equal(apk.readUInt32LE(offset), 0x02014b50, 'Invalid ZIP directory entry');
  const method = apk.readUInt16LE(offset + 10);
  const size = apk.readUInt32LE(offset + 20);
  const nameLength = apk.readUInt16LE(offset + 28);
  const extraLength = apk.readUInt16LE(offset + 30);
  const commentLength = apk.readUInt16LE(offset + 32);
  const local = apk.readUInt32LE(offset + 42);
  const name = apk.toString('utf8', offset + 46, offset + 46 + nameLength);
  assert.equal(name.includes('\\'), false, 'APK path contains a Windows separator: ' + name);
  if (name === 'resources.arsc') assert.equal(method, 0, 'Android resource table must be stored without compression');
  assert.equal(apk.readUInt32LE(local), 0x04034b50, 'Invalid ZIP file header');
  const start = local + 30 + apk.readUInt16LE(local + 26) + apk.readUInt16LE(local + 28);
  const data = apk.subarray(start, start + size);
  assert.ok(method === 0 || method === 8, 'Unsupported ZIP compression');
  assert.equal(entries.has(name), false, 'Duplicate APK entry: ' + name);
  entries.set(name, method === 8 ? inflateRawSync(data) : data);
  offset += 46 + nameLength + extraLength + commentLength;
}
assert.ok(entries.has('AndroidManifest.xml'), 'APK manifest missing');
assert.match(entries.get('classes.dex')?.subarray(0, 8).toString() || '', /^dex\n03[5-9]\0$/, 'Compiled Android host missing');
assert.ok(entries.has('resources.arsc'), 'Compiled Android resources missing');

async function walk(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}
const gameRoot = path.join(root, 'game');
const files = await walk(gameRoot);
for (const file of files) {
  const name = 'assets/' + path.relative(gameRoot, file).split(path.sep).join('/');
  assert.ok(entries.has(name), 'Game file missing from APK: ' + name);
  assert.deepEqual(entries.get(name), await readFile(file), 'APK contains an older game file: ' + name);
}
assert.equal([...entries.keys()].filter(name => name.startsWith('assets/') && !name.endsWith('/')).length,
  files.length, 'Unexpected game assets in APK');
const hash = createHash('sha256').update(apk).digest('hex');
assert.equal((await readFile(apkPath + '.sha256', 'utf8')).split(/\s/)[0], hash, 'APK checksum mismatch');
console.log('Android APK: native host compiled; ' + files.length + ' game files match; SHA-256 verified; ' + apk.length + ' bytes.');
