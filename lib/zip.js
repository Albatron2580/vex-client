// Minimal ZIP reader (no dependencies). Reads the central directory, then entries on demand,
// so large jars are never loaded into memory in one piece.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readFully(fd, buf, pos) {
  let done = 0;
  while (done < buf.length) {
    const n = fs.readSync(fd, buf, done, buf.length - done, pos + done);
    if (n <= 0) throw new Error('Unexpected end of file (is the download complete?)');
    done += n;
  }
  return buf;
}

class Zip {
  constructor(file) {
    this.file = file;
    this.fd = fs.openSync(file, 'r');
    try {
      this._load();
    } catch (e) {
      fs.closeSync(this.fd);
      throw e;
    }
  }

  _load() {
    const size = fs.fstatSync(this.fd).size;
    if (size < 22) throw new Error('Not a valid ZIP file');
    const tail = Math.min(size, 65557);
    const buf = readFully(this.fd, Buffer.alloc(tail), size - tail);
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error('Not a valid ZIP file');
    const count = buf.readUInt16LE(eocd + 10);
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOff = buf.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdOff === 0xffffffff) throw new Error('ZIP64 archives are not supported');
    const cd = readFully(this.fd, Buffer.alloc(cdSize), cdOff);
    this.entries = new Map();
    let p = 0;
    for (let n = 0; n < count; n++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt ZIP directory');
      const method = cd.readUInt16LE(p + 10);
      const csize = cd.readUInt32LE(p + 20);
      const usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28);
      const elen = cd.readUInt16LE(p + 30);
      const clen = cd.readUInt16LE(p + 32);
      const off = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/');
      this.entries.set(name, { name, method, csize, usize, off, dir: name.endsWith('/') });
      p += 46 + nlen + elen + clen;
    }
  }

  has(name) { return this.entries.has(name); }
  names() { return [...this.entries.keys()]; }

  read(name) {
    const e = this.entries.get(name);
    if (!e) throw new Error(`"${name}" is not inside this ZIP`);
    const h = readFully(this.fd, Buffer.alloc(30), e.off);
    if (h.readUInt32LE(0) !== 0x04034b50) throw new Error('Corrupt ZIP entry');
    const start = e.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
    const data = readFully(this.fd, Buffer.alloc(e.csize), start);
    if (e.method === 0) return data;
    if (e.method === 8) return zlib.inflateRawSync(data);
    throw new Error('Unsupported ZIP compression method');
  }

  readText(name) { return this.read(name).toString('utf8').replace(/^﻿/, ''); }

  readJson(name) { return JSON.parse(this.readText(name)); }

  // Extract every entry under `prefix` into destDir. Entries that would land outside destDir are refused.
  extract(prefix, destDir) {
    const base = path.resolve(destDir);
    let count = 0;
    for (const e of this.entries.values()) {
      if (e.dir || !e.name.startsWith(prefix)) continue;
      const rel = e.name.slice(prefix.length);
      if (!rel) continue;
      const target = path.resolve(base, rel);
      if (target !== base && !target.startsWith(base + path.sep)) {
        throw new Error(`Unsafe path in archive: ${e.name}`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, this.read(e.name));
      count++;
    }
    return count;
  }

  close() {
    try { fs.closeSync(this.fd); } catch { /* already closed */ }
  }
}

// Open, run fn(zip), always close.
function withZip(file, fn) {
  const z = new Zip(file);
  try { return fn(z); } finally { z.close(); }
}

module.exports = { Zip, withZip };
