'use strict';
const { Buffer } = require('buffer');

// QC64 NavigationViewModel.HidRcvProc, restored IL:
// 0x17e2: index at payload[5 + slot*5], 0xff means unused;
// 0x2219: CalMin[index] = LE16(payload[6 + slot*5]);
// 0x2dc4: CalMax[index] = LE16(payload[8 + slot*5]);
// 0x9235: three slots per payload.
function decodeCalibrationEntries(body, physicalKeys) {
  if (!Buffer.isBuffer(body) || body.length !== 15) throw new Error('Expected 15-byte calibration entry body');
  if (!Array.isArray(physicalKeys) || physicalKeys.length !== 64) throw new Error('Expected vendor physical key order');
  const entries = [];
  for (let offset = 0; offset < 15; offset += 5) {
    const index = body[offset];
    if (index === 255) continue;
    if (index >= 64) throw new Error(`Invalid calibration key index ${index}`);
    const key = physicalKeys[index];
    const min = body.readUInt16LE(offset + 1), max = body.readUInt16LE(offset + 3);
    entries.push({ index, id: key.id, row: key.row, col: key.col, min, max, rangeReady: max - min > 500 });
  }
  return entries;
}

function decodeCalibrationPayload(payload, physicalKeys) {
  if (!Buffer.isBuffer(payload) || payload.length !== 20) throw new Error('Expected decoded 20-byte payload');
  // Receive dispatch checks byte 1. Do not assume responses echo output byte 0.
  if (payload[1] !== 0x30) return null;
  return { entries: decodeCalibrationEntries(payload.subarray(5), physicalKeys), header: Buffer.from(payload.subarray(0, 5)) };
}

function mergeCalibrationEntries(target, entries) {
  if (!(target instanceof Map)) throw new TypeError('Expected a calibration entry map');
  if (!Array.isArray(entries)) throw new TypeError('Expected calibration entries');
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !Number.isInteger(entry.min) || !Number.isInteger(entry.max)) continue;
    target.set(entry.id, { ...entry, rangeStatus: entry.max - entry.min > 500 ? 'ok' : 'not-calibrated' });
  }
  return target;
}

module.exports = { decodeCalibrationEntries, decodeCalibrationPayload, mergeCalibrationEntries };
