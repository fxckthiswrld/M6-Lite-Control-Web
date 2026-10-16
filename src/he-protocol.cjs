'use strict';
const { Buffer } = require('buffer');
const { encodeMagCommandRaw } = require('./mag-command.cjs');
const ROWS = 5, COLS = 14, KEY_SIZE = 14;
const fields = ['head', 'trigger', 'release', 'fixedDown', 'fixedUp', 'bottom'];

function parseHeProfile(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== 984) throw new Error('Incomplete HE profile: expected 984 bytes');
  const keys = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const offset = i * KEY_SIZE;
    const key = { row: Math.floor(i / COLS), col: i % COLS, rtOn: bytes[offset], reserved: bytes[offset+1] };
    fields.forEach((name, j) => { key[name] = bytes.readUInt16LE(offset+2+j*2); });
    keys.push(key);
  }
  return { keys, trailer: bytes.subarray(980).toString('hex') };
}

function encodeHeWrite(key, layer = 0, command = 1) {
  if (!Number.isInteger(layer) || layer < 0 || layer > 1) throw new RangeError('Verified profiles are M1 and M2');
  if (!Number.isInteger(key.row) || key.row < 0 || key.row >= ROWS || !Number.isInteger(key.col) || key.col < 0 || key.col >= COLS)
    throw new RangeError('Invalid physical switch coordinate');
  if (key.rtOn !== 0 && key.rtOn !== 1) throw new RangeError('RT flag must be 0 or 1');
  if (![1,7].includes(command)) throw new RangeError('Unsupported magnetic write command');
  const payload = Buffer.alloc(20);
  encodeMagCommandRaw({ ...key, layer, command }).copy(payload);
  // Original SendMagCfg leaves queue byte19 untouched. New zero-initialized
  // command rows use zero; live readback tests establish acceptance separately.
  return payload;
}

// Assemble original INIT transfer headers: [08,00,kind,totalLE,sequenceLE,tag,data12].
class InitTransfer {
  constructor(kind) { this.kind = kind; this.total = null; this.parts = new Map(); }
  accept(payload) {
    if (payload.length !== 20 || payload[0] !== 8 || payload[1] !== 0 || payload[2] !== this.kind) return false;
    const total = payload.readUInt16LE(3), sequence = payload.readUInt16LE(5);
    if (!total || total > 4096 || sequence < 1 || sequence > total) throw new Error('Invalid transfer sequence');
    if (this.total !== null && this.total !== total) throw new Error('Transfer length changed');
    this.total = total;
    const data = Buffer.from(payload.subarray(8));
    if (this.parts.has(sequence) && !this.parts.get(sequence).equals(data)) throw new Error('Conflicting transfer packet');
    this.parts.set(sequence, data);
    return this.parts.size === total;
  }
  finish() {
    if (this.total === null || this.parts.size !== this.total) throw new Error('Incomplete device transfer');
    return Buffer.concat(Array.from({ length: this.total }, (_, i) => this.parts.get(i+1)));
  }
}
module.exports = { parseHeProfile, encodeHeWrite, InitTransfer, ROWS, COLS, fields };
