// Minimal ZIP writer and reader for journal backups. No compression ("stored"): audio is
// already compressed, so this keeps backups fast and the code small. Works in the browser
// (window.RZip) and in Node (require) for tests.
(function (root) {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes, crc) {
    let c = crc === undefined ? 0xFFFFFFFF : crc;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return c;
  }
  const crcDone = (c) => (c ^ 0xFFFFFFFF) >>> 0;

  function dosTime(d) {
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  }
  function dosDate(d) {
    return (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  }

  // files: [{ name: string, data: Uint8Array, date?: Date }]  ->  Uint8Array parts (to build a Blob or Buffer)
  function zipParts(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name);
      // A file is either bytes in memory (data) or a Blob with its size and CRC already known,
      // so a large journal never has to be held in memory all at once.
      const data = f.blob ? { length: f.size } : f.data;
      const crc = f.blob ? f.crc : crcDone(crc32(data));
      const d = f.date || new Date();
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint16(8, 0, true);      // stored
      local.setUint16(10, dosTime(d), true);
      local.setUint16(12, dosDate(d), true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, f.blob || data);

      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime(d), true);
      cen.setUint16(14, dosDate(d), true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + data.length;
    });
    if (offset > 0xFFFFFFFF) throw new Error('backup_too_large');
    const cenSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true);
    end.setUint32(16, offset, true);
    return parts.concat(central, [new Uint8Array(end.buffer)]);
  }

  // bytes: Uint8Array of a whole zip  ->  [{ name, data: Uint8Array }]
  function unzip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not_a_zip');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad_zip');
      const method = dv.getUint16(p + 10, true);
      const crc = dv.getUint32(p + 16, true);
      const size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      if (method !== 0) throw new Error('compressed_zip');
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(start, start + size);
      if (crcDone(crc32(data)) !== crc) throw new Error('crc_mismatch:' + name);
      out.push({ name, data });
    }
    return out;
  }


  // Reads a zip lazily from a Blob/File (e.g. a folder compressed in the iPhone Files app).
  // Returns entries; each has a .blob() that streams just that file, inflating it if needed,
  // so even large archives are never loaded into memory at once.
  async function blobEntries(file) {
    const size = file.size;
    const tailStart = Math.max(0, size - 65557);
    const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
    const tv = new DataView(tail.buffer);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) { if (tv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('not_a_zip');
    const count = tv.getUint16(eocd + 10, true);
    const cdSize = tv.getUint32(eocd + 12, true);
    const cdOff = tv.getUint32(eocd + 16, true);
    if (cdOff === 0xFFFFFFFF || count === 0xFFFF) throw new Error('zip64_unsupported');
    const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
    const dv = new DataView(cd.buffer);
    const dec = new TextDecoder();
    const out = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad_zip');
      const method = dv.getUint16(p + 10, true);
      const time = dv.getUint16(p + 12, true);
      const date = dv.getUint16(p + 14, true);
      const csize = dv.getUint32(p + 20, true);
      const usize = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      const when = new Date(((date >> 9) & 0x7f) + 1980, ((date >> 5) & 0x0f) - 1, date & 0x1f, (time >> 11) & 0x1f, (time >> 5) & 0x3f, (time & 0x1f) * 2);
      out.push({
        name, size: usize, method, date: when,
        async blob(type) {
          const head = new DataView(await file.slice(localOff, localOff + 30).arrayBuffer());
          const start = localOff + 30 + head.getUint16(26, true) + head.getUint16(28, true);
          const raw = file.slice(start, start + csize);
          if (method === 0) return new Blob([raw], { type: type || '' });
          if (method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('unsupported_compression');
          const inflated = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
          return new Blob([inflated], { type: type || '' });
        }
      });
    }
    return out;
  }

  // CRC of a Blob, read in 4 MB slices.
  async function blobCrc(blob) {
    let c = 0xFFFFFFFF;
    for (let off = 0; off < blob.size; off += 4194304) {
      c = crc32(new Uint8Array(await blob.slice(off, off + 4194304).arrayBuffer()), c);
    }
    return crcDone(c);
  }

  const api = { zipParts, unzip, blobEntries, blobCrc, crc32: (b) => crcDone(crc32(b)) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RZip = api;
})(typeof self !== 'undefined' ? self : this);
