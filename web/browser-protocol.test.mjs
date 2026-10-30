import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseCalibration } = require('../src/calibration.cjs');
const { validateProfile } = require('../src/he-profile-file.cjs');
const { prepareQuickPreset } = require('../src/preset-off.cjs');
const { encodeStandardRemap, encodeModify, parseProgrammingProfile, buildDksRecord, encodeDks } = require('../src/key-programming.cjs');
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
  assert.equal(plan.commands[0][2], 11);
  assert.equal(plan.commands[1][2], 11);
  assert.deepEqual([...plan.commands[0].subarray(6, 12)], [2, 1, 5, 0, 3, 3]);
  assert.deepEqual([...plan.commands[1].subarray(6, 12)], [2, 3, 5, 0, 3, 1]);
  assert.equal(plan.expected[8 + 29 * 68], 5);
  assert.equal(plan.expected[8 + 31 * 68], 5);
});

test('quick CL preset emits A/D cancel writes', () => {
  const plan = prepareQuickPreset(programmingFixture(), 0, 'cl');
  assert.equal(plan.commands.length, 2);
  assert.deepEqual(plan.commands.map(command => command[2]), [12, 12]);
  assert.deepEqual([...plan.commands[0].subarray(6, 10)], [2, 1, 6, 0]);
  assert.deepEqual([...plan.commands[1].subarray(6, 10)], [2, 3, 6, 0]);
  assert.equal(plan.expected[8 + 29 * 68], 6);
  assert.equal(plan.expected[8 + 31 * 68], 6);
});

test('Off accepts leftover SNAP fields on DKS WASD keys', () => {
  const dks = prepareQuickPreset(programmingFixture(), 0, 'dks');
  const stale = Buffer.from(dks.expected);
  for (const [index, row, col] of [[29, 3, 3], [31, 3, 1]]) {
    stale[8 + index * 68 + 64] = row;
    stale[8 + index * 68 + 65] = col;
  }
  assert.doesNotThrow(() => prepareQuickPreset(stale, 0, 'off'));
});

test('quick preset readback verifies each requested assignment', () => {
  const adapter = new BrowserAdapter();
  const dks = prepareQuickPreset(programmingFixture(), 0, 'dks');
  const snap = prepareQuickPreset(programmingFixture(), 0, 'snap');
  const cl = prepareQuickPreset(programmingFixture(), 0, 'cl');
  adapter.verifyQuickPreset(parseProgrammingProfile(dks.expected), 0, 'dks');
  adapter.verifyQuickPreset(parseProgrammingProfile(snap.expected), 0, 'snap');
  adapter.verifyQuickPreset(parseProgrammingProfile(cl.expected), 0, 'cl');
  assert.doesNotThrow(() => prepareQuickPreset(cl.expected, 0, 'off'));
  assert.throws(() => adapter.verifyQuickPreset(parseProgrammingProfile(programmingFixture()), 0, 'dks'), /DKS readback mismatch/);
});

test('custom DKS writes the selected physical target into the DKS subrecord', () => {
  const parsed = parseProgrammingProfile(programmingFixture());
  const key = parsed.keys[2 * 14 + 7];
  const dks = buildDksRecord(key.record.subarray(52, 64), { row: 4, col: 4 }, 20);
  assert.equal(dks.length, 12);
  const command = encodeDks(key, 0, 0, dks);
  assert.deepEqual([...command.subarray(8, 12)], [4, 0, 4, 4]);
  assert.equal(command.readUInt16LE(17), 20);
});

test('keyboard programming writes use one-based target rows', () => {
  const remap = encodeStandardRemap({ row: 2, col: 1, locked: 0 }, 0, 0, { row: 2, col: 3 });
  assert.deepEqual([...remap.subarray(9, 12)], [0, 3, 3]);
  const full = encodeStandardRemap({ row: 2, col: 1, locked: 0 }, 0, 0, { row: 5, col: 20 });
  assert.deepEqual([...full.subarray(10, 12)], [6, 20]);
  const modify = encodeModify({ row: 2, col: 1, locked: 0 }, 0, 0, { type: 0, row: 2, col: 3 });
  assert.deepEqual([...modify.subarray(9, 12)], [0, 3, 3]);
});

test('HE writes encode the UI boolean RT flag as a numeric protocol byte', async () => {
  const raw = Buffer.alloc(984);
  const config = Buffer.alloc(14);
  const adapter = new BrowserAdapter();
  let sent;
  const heWrites = [], order = [];
  adapter.device = {
    readInit: async kind => {
      if (kind === 1) return Buffer.from(config);
      if (kind === 2 || kind === 4) return Buffer.alloc(4776);
      if (kind === 24) return Buffer.alloc(420);
      return Buffer.from(raw);
    },
    send: async payload => {
      sent = Buffer.from(payload);
      if (sent[1] === 2) sent.subarray(2, 16).copy(config);
      else if (sent[1] === 0x31) {
        order.push('write');
        heWrites.push(sent);
        const offset = (2 * 14 + 1) * 14;
        raw[offset] = sent[6];
        for (let i = 0; i < 6; i++) raw.writeUInt16LE(sent.readUInt16LE(7 + i * 2), offset + 2 + i * 2);
      }
    },
    openReportStream() {
      order.push('stream');
      const responses = [Buffer.from([0, 0xc9]), Buffer.from([0, 0xca]), Buffer.from([0, 0xfe])];
      return { next: async () => responses.shift() ?? null, close() {} };
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
  assert.deepEqual(order.slice(0, 2), ['stream', 'write']);
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

test('WebHID reconnect opens a device delivered by the connect event', async () => {
  const reportCollections = [{ usagePage: 0x000c, outputReports: [{ reportId: 4, reportSize: 160 }] }];
  const replacement = {
    vendorId: 0x2233, productId: 0x006b, productName: 'event-device', opened: false, collections: reportCollections,
    async open(){this.opened=true;}
  };
  const hid = new EventTarget();
  hid.getDevices = async()=>[];
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { hid } });
  try {
    setTimeout(()=>{const event=new Event('connect');Object.defineProperty(event,'device',{value:replacement});hid.dispatchEvent(event);},5);
    const details = await new BrowserDevice().reconnect({ timeout: 500, interval: 1 });
    assert.equal(details.productName, 'event-device');
  } finally {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  }
});

test('performance mode reports a pending restart so the page can reload', async () => {
  const adapter = new BrowserAdapter();
  let reconnectCalled = false;
  adapter.applyDeviceSetting = async()=>({ changed: true, performanceMode: 1 });
  adapter.device.reconnect = async()=>{reconnectCalled=true;};
  const result = await adapter.setPerformanceMode(1);
  assert.equal(result.reconnectPending, true);
  assert.equal(reconnectCalled, false);
});

function singleFixture() {
  const sections = new Map([1, 2, 4, 24, 25, 26, 6, 7, 9, 17].map(kind => [kind, Buffer.alloc(kind === 7 ? 840 : kind === 6 ? 228 : 24)]));
  const record = sections.get(7);
  for (let index = 0; index < 84; index++) { record[index * 10 + 1] = 1; record.fill(37, index * 10 + 6, index * 10 + 10); }
  const writes = [];
  const device = {
    readInit(kind) { return Buffer.from(sections.get(kind)); },
    send(payload) {
      writes.push(Buffer.from(payload));
      if (payload[1] === 17) payload.copy(sections.get(17), 0, 2, 20);
      else if (payload[1] === 8 && payload[2] === 1) payload.copy(record, (payload[3] * 6 + payload[4]) * 10, 5, 11);
    }
  };
  return { sections, device, writes };
}

test('Single Light brightness writes preserve each selected RGB and override flag', async () => {
  const { sections, device, writes } = singleFixture();
  sections.get(7).set([1, 1, 57, 12, 34, 56], 80);
  sections.get(7).set([0, 1, 193, 87, 65, 43], 140);
  const before = Buffer.from(sections.get(7));
  const adapter = new BrowserAdapter();
  adapter.device = device;
  const result = await adapter.setSingleLight({ keys: ['2:1', '2:2'], brightness: 128 });
  const expected = Buffer.from(before); expected[82] = 128; expected[142] = 128;
  assert.deepEqual(sections.get(7), expected);
  // INIT17 is re-sent around the key records so the overlay is redrawn on the device.
  assert.equal(writes.length, 4);
  assert.equal(writes[0][1], 17);
  assert.equal(writes[1][1], 8);
  assert.equal(writes[2][1], 8);
  assert.equal(writes[3][1], 17);
  assert.equal(result.keys.find(key => key.id === '2:1').brightness, 128);
});

test('Single Light color-only and enable-only writes preserve stored brightness', async () => {
  const { sections, device } = singleFixture();
  sections.get(7).set([1, 1, 73, 12, 34, 56], 80);
  const adapter = new BrowserAdapter();
  adapter.device = device;
  await adapter.setSingleLight({ keys: ['2:1'], color: '#112233' });
  assert.deepEqual([...sections.get(7).subarray(83, 86)], [17, 34, 51]);
  assert.equal(sections.get(7)[82], 73);
  await adapter.setSingleLight({ keys: ['2:1'], enabled: false });
  assert.equal(sections.get(7)[80], 0);
  assert.equal(sections.get(7)[82], 73);
});

test('Single Light color assignment activates the key and enables the layer', async () => {
  const { sections, device } = singleFixture();
  const adapter = new BrowserAdapter();
  adapter.device = device;
  assert.equal(sections.get(7)[80], 0);
  assert.equal(sections.get(17)[6], 0);
  const result = await adapter.setSingleLight({ keys: ['2:1'], color: '#112233' });
  assert.equal(sections.get(7)[80], 1);
  assert.equal(sections.get(17)[6], 1);
  assert.equal(result.enabled, true);
  assert.equal(result.keys.find(key => key.id === '2:1').enabled, true);
});

test('Explicit Single Light disable keeps a colored key off and the layer untouched', async () => {
  const { sections, device } = singleFixture();
  const adapter = new BrowserAdapter();
  adapter.device = device;
  await adapter.setSingleLight({ keys: ['2:1'], enabled: false, color: '#112233' });
  assert.equal(sections.get(7)[80], 0);
  assert.equal(sections.get(17)[6], 0);
});

test('Single Light brightness edits do not activate a key or the layer', async () => {
  const { sections, device } = singleFixture();
  const adapter = new BrowserAdapter();
  adapter.device = device;
  await adapter.setSingleLight({ keys: ['2:1'], brightness: 128 });
  assert.equal(sections.get(7)[80], 0);
  assert.equal(sections.get(17)[6], 0);
});

test('Single Light rejects effect requests and invalid brightness before writing', async () => {
  const { device, writes } = singleFixture();
  const adapter = new BrowserAdapter();
  adapter.device = device;
  await assert.rejects(() => adapter.setSingleLight({ keys: ['2:1'], mode: 2 }), /RGB and brightness editing only/);
  await assert.rejects(() => adapter.setSingleLight({ keys: ['2:1'], brightness: 256 }), /Brightness/);
  await assert.rejects(() => adapter.setSingleLight({ keys: ['2:1'] }), /Expected RGB/);
  assert.equal(writes.length, 0);
});

function settingsFixture() {
  const sections = new Map([1, 2, 4, 24, 25, 26, 6, 7, 9, 17].map(kind => [kind, Buffer.alloc(kind === 6 ? 228 : 24, kind + 16)]));
  const deviceSettings = sections.get(1);
  deviceSettings[3] = 2; deviceSettings[8] = 0; deviceSettings[9] = 7; deviceSettings[12] = 1; deviceSettings[13] = 0;
  const lighting = sections.get(17);
  lighting.set([170, 180, 190]); lighting[4] = 0;
  const writes = [];
  const device = {
    readInit(kind) { return Buffer.from(sections.get(kind)); },
    send(payload) {
      writes.push(Buffer.from(payload));
      if (payload[1] !== 2 && payload[1] !== 17) return;
      const target = payload[1] === 2 ? 1 : 17;
      payload.copy(sections.get(target), 0, 2, target === 1 ? 16 : 20);
    }
  };
  const adapter = new BrowserAdapter();
  adapter.device = device;
  return { sections, adapter, writes };
}

test('device settings expose MMPanel parity fields', async () => {
  const { adapter } = settingsFixture();
  const settings = await adapter.readDeviceSettings();
  assert.equal(settings.performanceMode, 2);
  assert.equal(settings.autoCalibration, 0);
  assert.equal(settings.canEditAutoCalibration, true);
  assert.equal(settings.autoLightOff, 0);
  assert.equal(settings.autoLightOffMinutes, 7);
  assert.equal(settings.canEditAutoLightOff, true);
  assert.equal(settings.highlight, 0);
  assert.equal(settings.canEditHighlight, true);
  assert.deepEqual(settings.saturation, [170, 180, 190]);
  assert.equal(settings.canEditSaturation, true);
});

test('Highlight and Saturation patch only their INIT17 bytes', async () => {
  const { sections, adapter, writes } = settingsFixture();
  const beforeLight = Buffer.from(sections.get(17));
  const highlight = await adapter.setHighlight(true);
  assert.equal(highlight.highlight, 1);
  assert.deepEqual([...writes[0].subarray(0, 2)], [8, 17]);
  const expectedLight = Buffer.from(beforeLight); expectedLight[4] = 1;
  assert.deepEqual(sections.get(17), expectedLight);
  const saturation = await adapter.setSaturation([64, 128, 255]);
  assert.deepEqual(saturation.saturation, [64, 128, 255]);
  expectedLight.set([64, 128, 255]);
  assert.deepEqual(sections.get(17), expectedLight);
});

test('Auto calibration and Auto light off patch INIT1 and preserve the delay when disabled', async () => {
  const { sections, adapter } = settingsFixture();
  const beforeSettings = Buffer.from(sections.get(1));
  assert.equal((await adapter.setAutoCalibration(true)).autoCalibration, 1);
  const expectedSettings = Buffer.from(beforeSettings); expectedSettings[13] = 1;
  assert.deepEqual(sections.get(1), expectedSettings);
  const enabled = await adapter.setAutoLightOff({ enabled: true, minutes: 30 });
  assert.equal(enabled.autoLightOff, 1);
  assert.equal(enabled.autoLightOffMinutes, 30);
  expectedSettings[8] = 1; expectedSettings[9] = 30;
  assert.deepEqual(sections.get(1), expectedSettings);
  const disabled = await adapter.setAutoLightOff({ enabled: false });
  assert.equal(disabled.autoLightOff, 0);
  assert.equal(disabled.autoLightOffMinutes, 30);
  expectedSettings[8] = 0;
  assert.deepEqual(sections.get(1), expectedSettings);
});

test('MMPanel settings reject invalid values before device access', async () => {
  const { adapter, writes } = settingsFixture();
  await assert.rejects(() => adapter.setAutoCalibration(1), /enabled or disabled/);
  await assert.rejects(() => adapter.setHighlight('on'), /enabled or disabled/);
  await assert.rejects(() => adapter.setAutoLightOff({ enabled: true, minutes: 31 }), /1 to 30/);
  await assert.rejects(() => adapter.setAutoLightOff({ enabled: true, minutes: 1.5 }), /1 to 30/);
  await assert.rejects(() => adapter.setSaturation([63, 128, 255]), /three integers/);
  await assert.rejects(() => adapter.setSaturation([64, 128]), /three integers/);
  assert.equal(writes.length, 0);
});

test('unrecognized stored MMPanel values block only their own setting', async () => {
  const { sections, adapter } = settingsFixture();
  sections.get(1)[13] = 9;
  await assert.rejects(() => adapter.setAutoCalibration(true), /Unsupported device setting value/);
  sections.get(17)[4] = 9;
  await assert.rejects(() => adapter.setHighlight(true), /Unsupported device setting value/);
});

test('calibration reset sends 08 30 04 and verifies every record at baseline', async () => {
  const before = Buffer.alloc(420);
  for (let index = 0; index < 70; index++) { before[index * 6] = index % 2; before.writeUInt16LE(1700 + index, index * 6 + 2); before.writeUInt16LE(2600 + index, index * 6 + 4); }
  const after = Buffer.from(before);
  for (let index = 0; index < 70; index++) { after.writeUInt16LE(2000, index * 6 + 2); after.writeUInt16LE(2200, index * 6 + 4); }
  let reads = 0; const writes = [];
  const adapter = new BrowserAdapter();
  adapter.device = {
    readInit(kind) { assert.equal(kind, 24); reads++; return Buffer.from(reads === 1 ? before : after); },
    send(payload) { writes.push(Buffer.from(payload)); }
  };
  const result = await adapter.resetCalibration();
  assert.equal(result.verified, true);
  assert.equal(result.resetCount, 70);
  assert.deepEqual([...writes[0].subarray(0, 3)], [8, 48, 4]);
});

test('calibration reset rejects a non-baseline readback', async () => {
  const before = Buffer.alloc(420);
  const after = Buffer.from(before); after.writeUInt16LE(1999, 2);
  let reads = 0;
  const adapter = new BrowserAdapter();
  adapter.device = {
    readInit() { reads++; return Buffer.from(reads === 1 ? before : after); },
    send() {}
  };
  await assert.rejects(() => adapter.resetCalibration(), /readback mismatch/);
});

test('reset all programming sends a reset for every visible key and verifies Standard', async () => {
  const raw = programmingFixture();
  const sections = new Map([[2, raw], [4, Buffer.from(raw)]]);
  let writes = 0;
  const adapter = new BrowserAdapter();
  adapter.device = {
    readInit(kind) { return Buffer.from(sections.get(kind)); },
    send(packet) {
      writes++; assert.equal(packet[0], 8); assert.equal(packet[1], 3); assert.equal(packet[2], 2);
      const target = packet[3] ? 4 : 2;
      const offset = 8 + (packet[6] * 14 + packet[7]) * 68;
      sections.get(target).fill(0, offset, offset + 68);
    }
  };
  const result = await adapter.resetAllProgramming({ layer: 0 });
  assert.equal(result.verified, true);
  assert.equal(result.resetCount, 64);
  assert.equal(writes, 64);
});

test('reset all programming rejects an unknown profile layer', async () => {
  const adapter = new BrowserAdapter();
  adapter.device = { readInit() { throw new Error('unexpected device access'); } };
  await assert.rejects(() => adapter.resetAllProgramming({ layer: 2 }), /Select M1 or M2/);
});

test('calibrate selected keys stores multiple ids in the browser session', async () => {
  const before = Buffer.alloc(420);
  const sent = [];
  const adapter = new BrowserAdapter();
  adapter.device = {
    readInit() { return Buffer.from(before); },
    send(packet) { sent.push(Buffer.from(packet)); }
  };
  const result = await adapter.calibrateSelectedKeys(['2:1', '2:3']);
  assert.equal(result.started, true);
  assert.deepEqual([...sent[0].subarray(0, 3)], [8, 48, 1]);
  const state = await adapter.calibrationState();
  assert.equal(state.active, true);
  assert.deepEqual(state.selectedIds, ['2:1', '2:3']);
});

test('calibrate selected keys rejects unknown switches', async () => {
  const adapter = new BrowserAdapter();
  adapter.device = { readInit() { throw new Error('unexpected device access'); }, send() {} };
  await assert.rejects(() => adapter.calibrateSelectedKeys(['bad']), /one or more physical switches/);
});

test('calibration telemetry decodes three slots and merges by physical key id', () => {
  const telemetry = require('../src/calibration-telemetry.cjs');
  const keys = layout.map(({ id, row, col }) => ({ id, row, col }));
  const payload = Buffer.alloc(20); payload[1] = 0x30;
  payload[5] = 0; payload.writeUInt16LE(2100, 6); payload.writeUInt16LE(2800, 8);
  payload[10] = 1; payload.writeUInt16LE(1500, 11); payload.writeUInt16LE(1900, 13);
  payload[15] = 255;
  const decoded = telemetry.decodeCalibrationPayload(payload, keys);
  assert.ok(decoded);
  assert.equal(decoded.entries.length, 2);
  assert.equal(decoded.entries[0].id, keys[0].id);
  const merged = telemetry.mergeCalibrationEntries(new Map(), decoded.entries);
  assert.equal(merged.get(keys[0].id).rangeStatus, 'ok');
  assert.equal(merged.get(keys[1].id).rangeStatus, 'not-calibrated');
});

test('calibration telemetry ignores unrelated payloads', () => {
  const telemetry = require('../src/calibration-telemetry.cjs');
  const keys = layout.map(({ id, row, col }) => ({ id, row, col }));
  const payload = Buffer.alloc(20); payload[1] = 0;
  assert.equal(telemetry.decodeCalibrationPayload(payload, keys), null);
});

test('readback preserves a queued save CRC request for the next save stream', async () => {
  const IN = Buffer.from('6a6d64663f2ef0430a41ea8f2bfce0e7d5527ba5', 'hex');
  const encode = payload => Buffer.from(payload.map((value, index) => value ^ IN[index]));
  const device = new BrowserDevice();
  const listeners = [];
  const emit = event => { for (const handler of [...listeners]) handler(event); };
  device.handle = {
    opened: true,
    collections: [{ usagePage: 0x000c, outputReports: [{ reportId: 4, reportSize: 160 }] }],
    addEventListener(_type, handler) { listeners.push(handler); },
    removeEventListener(_type, handler) { const index = listeners.indexOf(handler); if (index >= 0) listeners.splice(index, 1); },
    sendReport: async () => {}
  };
  device.attachInputMonitor();
  const reading = device.readInit(9);
  assert.equal(listeners.length, 2, 'the permanent monitor and readback listener must both be attached');
  const crc = Buffer.alloc(20); crc.set([0, 0xc9]);
  emit({ reportId: 4, data: encode(crc) });
  const reply = Buffer.alloc(20); reply.set([8, 0, 9, 1, 0, 1, 0]);
  emit({ reportId: 4, data: encode(reply) });
  const raw = await reading;
  assert.equal(raw.length, 12);
  assert.equal(device.pendingDeviceFrames.length, 1);
  assert.deepEqual([...device.pendingDeviceFrames[0].subarray(0, 2)], [0, 0xc9]);
  const stream = device.openReportStream();
  assert.deepEqual([...((await stream.next(10)).subarray(0, 2))], [0, 0xc9]);
  stream.close();
  assert.equal(device.pendingDeviceFrames.length, 0);
});
test('persistent lighting calls save with a report stream opened before the write', async () => {
  const adapter = new BrowserAdapter();
  const order = [], sent = [];
  const light = Buffer.alloc(32); light[0] = 5; light[10] = 200; light[11] = 1;
  const config = Buffer.alloc(20); config[9] = 1; config[10] = 200; config[11] = 0;
  adapter.device = {
    readInit: async kind => {
      order.push('read' + kind);
      if (kind === 9) return Buffer.from(light);
      if (kind === 17) return Buffer.from(config);
      if (kind === 2 || kind === 4) return Buffer.alloc(4776);
      if (kind === 25 || kind === 26) return Buffer.alloc(984);
      throw new Error('unexpected INIT' + kind);
    },
    send: async payload => { order.push('send'); sent.push(Buffer.from(payload)); },
    openReportStream: () => {
      order.push('stream');
      const responses = [Buffer.from([0, 0xc9]), Buffer.from([0, 0xca]), Buffer.from([0, 0xfe])];
      return { next: async () => responses.shift() ?? null, close: () => order.push('close') };
    }
  };
  const { result, persistence } = await adapter.persistentCall('setUnderLightMode', [5], { requireCrc: false });
  assert.equal(result.mode, 5);
  assert.equal(persistence.acknowledged, true);
  assert.equal(order[0], 'read2');
  assert.ok(order.indexOf('stream') < order.indexOf('send'));
  assert.equal(order.at(-1), 'close');
  assert.equal(sent.length, 4);
  assert.equal(sent[0][1], 11);
});