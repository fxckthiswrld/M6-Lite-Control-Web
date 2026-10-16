'use strict';
const { Buffer } = require('buffer');
// USBLib.UsbDevice.ArKtyv6d1 and m6-live-state4.txt, VID2233/PID006B/MI02.
// Output only. Input reports use a different transformation.
const OUTPUT_MASK = Buffer.from('8e96ce6af272994858612758e89a7f0195eeed2f', 'hex');
const INPUT_MASK = Buffer.from('6a6d64663f2ef0430a41ea8f2bfce0e7d5527ba5', 'hex');
const REPORT_ID = 4;
const REPORT_LENGTH = 21;

function encodeOutputReport(payload) {
  if (!(payload instanceof Uint8Array) || payload.length !== 20)
    throw new TypeError('Output command must contain exactly 20 bytes');
  const report = Buffer.alloc(REPORT_LENGTH);
  report[0] = REPORT_ID;
  for (let i = 0; i < 20; i++) report[i + 1] = payload[i] ^ OUTPUT_MASK[i];
  return report;
}

function decodeInputReport(report) {
  if (!(report instanceof Uint8Array) || report.length !== REPORT_LENGTH || report[0] !== REPORT_ID)
    throw new TypeError('Expected a 21-byte input report with ID 4');
  const payload = Buffer.from(report.subarray(1));
  // GetInputReportData20 bypasses XOR for these unsolicited vendor reports.
  if (report[2] === 0xbf) return payload;
  for (let i = 0; i < payload.length; i++) payload[i] ^= INPUT_MASK[i];
  return payload;
}
module.exports = { encodeOutputReport, decodeInputReport, REPORT_ID, REPORT_LENGTH };
