import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseCalibration } = require('../src/calibration.cjs');
const { validateProfile } = require('../src/he-profile-file.cjs');
const { prepareQuickPreset } = require('../src/preset-off.cjs');
const { encodeStandardRemap, encodeModify, parseProgrammingProfile } = require('../src/key-programming.cjs');
const { BrowserAdapter, BrowserDevice } = require('../src/browser-adapter.cjs');
const layout = require('./keyboard-layout.json');

test('browser calibration parser preserves 70 device records and status', () => {
  const raw = Buffer.alloc(420);
  raw.writeUInt16LE(2000, 2);
  raw.writeUInt16LE(2200, 4);
  const records = parseCalibration(raw);
  assert.equal(records.length, 70);
  assert.equal(records[0].rangeStatus, 'not-calibrated');
});

test('HE import validation accepts the current 64-key layout and rejects omissions', () => {
  const fields = ['head', 'trigger', 'release', 'fixedDown', 'fixedUp', 'bottom'];
  const document = {
    format: 'm6-lite-plus-he', version: 1, model: 'M6 Lite+',
    vendorId: 0x2233, productId: 0x006b, units: 'mm', sourceProfile: 'M1',
    keys: layout.map(key => ({ id: key.id, rtOn: false, ...Object.fromEntries(fields.map(field => [field, 1])) }))
  };
  assert.equal(validateProfile(document).length, 64);
  assert.throws(() => validateProfile({ ...document, keys: document.keys.slice(1) }), /all 64/);
});

function programmingFixture() {
  const raw = Buffer.alloc(4776);
  for (let index = 0; index < 70; index++) {
    const offset = 8 + index * 68;
    const row = Math.floor(index / 14), col = index % 14;
    raw[offset + 9] = row + 1;
    raw[offset + 10] = col;
    raw[offset + 64] = row + 1;
    raw[offset + 65] = col;
  }
  return raw;
}

test('quick DKS preset emits four individual writes including W', () => {
  const plan = prepareQuickPreset(programmingFixture(), 0, 'dks');
  assert.equal(plan.commands.length, 4);
  assert.deepEqual([...plan.commands[0].subarray(6, 12)], [1, 2, 4, 0, 3, 2]);
  assert.equal(plan.expected[8 + 16 * 68], 4);
  assert.equal(plan.expected[8 + 29 * 68], 4);
});

test('quick Snap preset emits pair writes for A and D', () => {
  const plan = prepareQuickPreset(programmingFixture(), 0, 'snap');
  assert.equal(plan.commands.length, 2);
  assert.deepEqual([...plan.commands[0].subarray(6, 12)], [2, 1, 5, 0, 3, 3]);
  assert.deepEqual([...plan.commands[1].subarray(6, 12)], [2, 3, 5, 0, 3, 1]);
  assert.equal(plan.expected[8 + 29 * 68], 5);
  assert.equal(plan.expected[8 + 31 * 68], 5);
});

test('quick preset readback verifies each requested assignment', () => {
  const adapter = new BrowserAdapter();
  const dks = prepareQuickPreset(programmingFixture(), 0, 'dks');
  const snap = prepareQuickPreset(programmingFixture(), 0, 'snap');
  adapter.verifyQuickPreset(parseProgrammingProfile(dks.expected), 0, 'dks');
  adapter.verifyQuickPreset(parseProgrammingProfile(snap.expected), 0, 'snap');
  assert.throws(() => adapter.verifyQuickPreset(parseProgrammingProfile(programmingFixture()), 0, 'dks'), /DKS readback mismatch/);
});

test('keyboard programming writes use one-based target rows', () => {
  const remap = encodeStandardRemap({ row: 2, col: 1, locked: 0 }, 0, 0, { row: 2, col: 3 });
  assert.deepEqual([...remap.subarray(9, 12)], [0, 3, 3]);
  const modify = encodeModify({ row: 2, col: 1, locked: 0 }, 0, 0, { type: 0, row: 2, col: 3 });
  assert.deepEqual([...modify.subarray(9, 12)], [0, 3, 3]);
});

test('HE writes encode the UI boolean RT flag as a numeric protocol byte', async () => {
  const raw = Buffer.alloc(984);
  const config = Buffer.alloc(14);
  const adapter = new BrowserAdapter();
  let sent;
  const heWrites = [];
  adapter.device = {
    readInit: async kind => kind === 1 ? Buffer.from(config) : Buffer.from(raw),
    send: async payload => {
      sent = Buffer.from(payload);
      if (sent[1] === 2) sent.subarray(2, 16).copy(config);
      else {
        heWrites.push(sent);
        const offset = (2 * 14 + 1) * 14;
        raw[offset] = sent[6];
        for (let i = 0; i < 6; i++) raw.writeUInt16LE(sent.readUInt16LE(7 + i * 2), offset + 2 + i * 2);
      }
    }
  };
  const result = await adapter.saveSelected({
    layer: 1,
    id: '2:1',
    rtOn: true,
    head: 0.2,
    bottom: 0.22,
    trigger: 0.24,
    release: 0.26,
    fixedDown: 1,
    fixedUp: 1
  });
  assert.equal(heWrites.length, 1);
  assert.equal(heWrites[0][6], 1);
  assert.equal(heWrites[0].readUInt16LE(7), 100);
  assert.equal(result.key.rtOn, true);
  assert.equal(result.key.trigger, 0.24);
  assert.equal(config[11], 0);
});

test('WebHID reconnect skips a stale descriptor and opens the replacement interface', async () => {
  const reportCollections = [{ usagePage: 0x000c, outputReports: [{ reportId: 4, reportSize: 160 }] }];
  let oldClosed = false;
  const stale = {
    vendorId: 0x2233, productId: 0x006b, productName: 'stale', opened: true, collections: reportCollections,
    async close(){oldClosed=true;this.opened=false;},
    async open(){throw new Error('The device is no longer connected');}
  };
  const replacement = {
    vendorId: 0x2233, productId: 0x006b, productName: 'replacement', opened: false, collections: reportCollections,
    async open(){this.opened=true;}
  };
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { hid: { getDevices: async()=>[stale,replacement] } } });
  try {
    const device = new BrowserDevice();
    device.handle=stale;
    device.lastDevice=stale;
    const details = await device.reconnect({ timeout: 500, interval: 1 });
    assert.equal(oldClosed, true);
    assert.equal(details.productName, 'replacement');
    assert.equal(device.connected, true);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

test('automatic startup connection does not open a permission prompt for an unpaired device', async () => {
  const originalNavigator = globalThis.navigator;
  let promptCalled = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { hid: {
    getDevices: async()=>[],
    requestDevice: async()=>{promptCalled=true;return[];}
  } } });
  try {
    await assert.rejects(() => new BrowserDevice().connect({ request: false }), /No paired M6 Lite\+ keyboard/);
    assert.equal(promptCalled, false);
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});
