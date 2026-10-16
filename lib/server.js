// Live Minecraft server status (the same "Server List Ping" the game's multiplayer screen uses):
// MOTD, players online / max, version, icon and latency. Supports SRV records (_minecraft._tcp).
const netSock = require('net');
const dns = require('dns').promises;

function varint(n) {
  const out = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
}

function readVarint(buf, off) {
  let num = 0;
  let shift = 0;
  for (let i = 0; i < 5; i++) {
    if (off + i >= buf.length) return null; // need more data
    const b = buf[off + i];
    num |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return { value: num, size: i + 1 };
    shift += 7;
  }
  throw new Error('Bad varint from server.');
}

const str = (s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([varint(b.length), b]); };
const packet = (id, body) => { const d = Buffer.concat([varint(id), body]); return Buffer.concat([varint(d.length), d]); };

async function resolve(host, port) {
  if (port && port !== 25565) return { host, port };
  try {
    const [srv] = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv && srv.name) return { host: srv.name, port: srv.port };
  } catch { /* no SRV record */ }
  return { host, port: port || 25565 };
}

// Turns the description (plain text with § codes, or a chat component) into [{ text, color, bold, italic }].
function motdParts(desc) {
  const out = [];
  const COLORS = { 0: 'black', 1: 'dark_blue', 2: 'dark_green', 3: 'dark_aqua', 4: 'dark_red', 5: 'dark_purple', 6: 'gold', 7: 'gray', 8: 'dark_gray', 9: 'blue', a: 'green', b: 'aqua', c: 'red', d: 'light_purple', e: 'yellow', f: 'white' };
  const fromLegacy = (text, base) => {
    let st = { ...base };
    for (const piece of String(text).split(/(§[0-9a-fk-or])/i)) {
      const m = /^§([0-9a-fk-or])$/i.exec(piece);
      if (!m) { if (piece) out.push({ text: piece, ...st }); continue; }
      const c = m[1].toLowerCase();
      if (COLORS[c]) st = { color: COLORS[c] };
      else if (c === 'l') st.bold = true;
      else if (c === 'o') st.italic = true;
      else if (c === 'r') st = { ...base };
    }
  };
  const walk = (node, inherit) => {
    if (node == null) return;
    if (typeof node === 'string') { fromLegacy(node, inherit); return; }
    if (Array.isArray(node)) { node.forEach((n) => walk(n, inherit)); return; }
    const st = { ...inherit };
    if (node.color) st.color = String(node.color);
    if (node.bold !== undefined) st.bold = !!node.bold;
    if (node.italic !== undefined) st.italic = !!node.italic;
    if (node.text !== undefined) fromLegacy(node.text, st);
    if (node.extra) walk(node.extra, st);
  };
  walk(desc, {});
  return out.slice(0, 200).map((p) => ({ text: p.text.slice(0, 200), color: /^(#[0-9a-f]{6}|[a-z_]+)$/i.test(p.color || '') ? p.color : '', bold: !!p.bold, italic: !!p.italic }));
}

function ping(hostIn, portIn = 25565, { timeout = 6000 } = {}) {
  return resolve(hostIn, portIn).then(({ host, port }) => new Promise((resolveP, reject) => {
    const sock = netSock.createConnection({ host, port });
    let buf = Buffer.alloc(0);
    let status = null;
    let sentAt = 0;
    const done = (err, val) => { clearTimeout(timer); sock.destroy(); if (err) reject(err); else resolveP(val); };
    const timer = setTimeout(() => done(new Error('The server did not answer in time.')), timeout);
    sock.on('error', (e) => done(new Error(e.code === 'ENOTFOUND' ? 'Server address not found.' : e.code === 'ECONNREFUSED' ? 'The server is offline.' : `Can't reach the server (${e.code || e.message}).`)));
    sock.on('connect', () => {
      const hs = Buffer.concat([varint(767), str(hostIn), Buffer.from([(port >> 8) & 255, port & 255]), varint(1)]);
      sock.write(packet(0x00, hs));
      sock.write(packet(0x00, Buffer.alloc(0)));
      sentAt = Date.now();
    });
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length > 2 * 1024 * 1024) return done(new Error('The server sent too much data.'));
      for (;;) {
        const len = readVarint(buf, 0);
        if (!len || buf.length < len.size + len.value) return;
        const body = buf.subarray(len.size, len.size + len.value);
        buf = buf.subarray(len.size + len.value);
        const id = readVarint(body, 0);
        if (id.value === 0x00 && !status) {
          const sl = readVarint(body, id.size);
          const json = body.subarray(id.size + sl.size, id.size + sl.size + sl.value).toString('utf8');
          let j;
          try { j = JSON.parse(json); } catch { return done(new Error('The server sent an unreadable status.')); }
          const latency = Date.now() - sentAt;
          const icon = typeof j.favicon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(j.favicon) && j.favicon.length < 200000 ? j.favicon.replace(/\s/g, '') : '';
          status = {
            online: true,
            players: { online: Number(j.players && j.players.online) || 0, max: Number(j.players && j.players.max) || 0 },
            version: String((j.version && j.version.name) || '').replace(/§./g, '').slice(0, 60),
            motd: motdParts(j.description),
            icon,
            latency,
          };
          // ask for a pong to measure latency properly
          const t = Buffer.alloc(8); t.writeBigInt64BE(BigInt(Date.now()));
          sentAt = Date.now();
          sock.write(packet(0x01, t));
        } else if (id.value === 0x01 && status) {
          status.latency = Date.now() - sentAt;
          return done(null, status);
        }
      }
    });
    sock.on('close', () => { if (status) done(null, status); });
  }));
}

module.exports = { ping, motdParts, varint, readVarint };
