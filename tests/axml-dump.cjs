'use strict';
/* Parse minimal d'un AndroidManifest.xml binaire (AXML) : extrait les attributs
   de <application> pour verifier usesCleartextTraffic/networkSecurityConfig. */
const fs = require('fs'), zlib = require('zlib');
const buf = fs.readFileSync(process.argv[2]);
// String pool : chercher les chunks; AXML commence par 0x00080003 (RES_XML_TYPE)
function utf16(strStart, strLen, data, headerSize) {
  let s = '';
  for (let i = 0; i < strLen; i++) {
    const c = data.readUInt16LE(headerSize + strStart + i * 2);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
let off = 8; // skip file header
let strings = [];
const types = ['STRING_POOL'];
while (off < buf.length - 8) {
  const type = buf.readUInt16LE(off);
  const size = buf.readUInt32LE(off + 4);
  if (type === 0x0001) { // string pool
    const strCount = buf.readUInt32LE(off + 8);
    const strStart = buf.readUInt32LE(off + 20);
    const flags = buf.readUInt32LE(off + 16);
    const utf8Flag = (flags & 0x100) !== 0;
    const offsets = [];
    for (let i = 0; i < strCount; i++) offsets.push(buf.readUInt32LE(off + 28 + i * 4));
    strings = offsets.map((o, i) => {
      const p = off + strStart + o;
      if (utf8Flag) {
        // u16len, u8len, bytes
        let len = buf.readUInt8(p); let l2 = buf.readUInt8(p + 1); // simplified
        let n = buf.readUInt8(p);
        if (n & 0x80) n = ((n & 0x7f) << 8) | buf.readUInt8(p + 1);
        let skip = (n & 0x80) ? 2 : 1;
        let n2 = buf.readUInt8(p + skip); if (n2 & 0x80) { n2 = ((n2 & 0x7f) << 8) | buf.readUInt8(p + skip + 1); skip += 1; }
        return buf.slice(p + skip + n2, p + skip + n2 + n).toString('utf8');
      }
      const len = buf.readUInt16LE(p);
      let s = '';
      for (let j = 0; j < len; j++) s += String.fromCharCode(buf.readUInt16LE(p + 2 + j * 2));
      return s;
    });
  } else if (type === 0x0100 || type === 0x0101 || type === 0x0180 || type === 0x0181) {
    // start/end namespace, start/end element
    if (type === 0x0102) { /* start element */ }
  }
  off += size > 0 ? size : 8;
}
// recherche d'elements start (0x0102) avec attributs
off = 8;
const interesting = ['usesCleartextTraffic', 'networkSecurityConfig', 'name', 'permission'];
while (off < buf.length - 8) {
  const type = buf.readUInt16LE(off);
  const size = buf.readUInt32LE(off + 4);
  if (type === 0x0102) { // START_ELEMENT
    const nameIdx = buf.readUInt16LE(off + 20);
    const attrStart = buf.readUInt16LE(off + 24);
    const attrSize = buf.readUInt16LE(off + 26);
    const attrCount = buf.readUInt16LE(off + 28);
    const elName = strings[nameIdx];
    for (let i = 0; i < attrCount; i++) {
      const ap = off + attrStart + i * attrSize;
      const aName = strings[buf.readUInt16LE(ap + 8)];
      const aRaw = strings[buf.readUInt32LE(ap + 12)];
      if (interesting.includes(aName)) {
        console.log(elName + ' @' + aName + ' = "' + aRaw + '"');
      }
    }
  }
  off += size > 0 ? size : 8;
}
