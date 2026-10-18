const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../../luci-base/root/usr/share/rpcd/ucode/luci'), 'utf8');
const method = source.slice(source.indexOf('\tgetMountPoints: {'), source.indexOf('\tgetRealtimeStats: {'));
let visited = [], closed = false;
const lines = ['/dev/root /rom squashfs ro 0 0', '/dev/ubi0_5 /overlay ubifs rw 0 0',
 'overlayfs:/overlay / overlay rw 0 0', '/dev/sda1 /mnt/USB\\040Disk vfat rw 0 0'];
const api = new Function('open', 'split', 'replace', 'chr', 'int', 'statvfs', 'length', 'push',
 'return ({' + method + '}).getMountPoints;')(
 () => { let i = 0; return {read: () => lines[i++] || '', close: () => {closed = true;}}; },
 (s, sep) => s.split(sep), (s, re, fn) => s.replace(re, fn), String.fromCharCode, parseInt,
 mount => {visited.push(mount); return {blocks: 100, bsize: 4096, bavail: 20, bfree: 25};},
 s => s.length, (a, v) => a.push(v));
const roots = api.call({args: {root_only: true}}).result;
assert.deepEqual(visited, ['/overlay', '/'], 'overview must not stat unrelated filesystems');
assert.deepEqual(roots.map(m => m.mount), visited);
assert.equal(roots[0].size, 409600);
assert(closed);
visited = []; closed = false;
const all = api.call({args: {}}).result;
assert.deepEqual(visited, ['/rom', '/overlay', '/', '/mnt/USB Disk']);
assert.equal(all.length, 4, 'existing callers must retain all mounts');
assert(closed);
console.log('Root-only storage query and backward-compatible full mount listing passed');
