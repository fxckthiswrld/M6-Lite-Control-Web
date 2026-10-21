import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { cacheCrc, saveDeviceMemory } = require('../src/device-memory.cjs');

function sections() {
  return new Map([[2, Buffer.alloc(4776)], [4, Buffer.alloc(4776)], [25, Buffer.alloc(984)], [26, Buffer.alloc(984)]]);
}

function fixture(responses) {
  const sent = [];
  return {
    sent,
    device: {
      async send(payload) { sent.push(Buffer.from(payload)); },
      openReportStream() {
        return {
          async next() { return responses.shift() ?? null; },
          close() {}
        };
      }
    }
  };
}

test('device-memory CRC matches the vendor vectors', () => {
  for (const [hex, value] of [['00000000', 0xc704dd7b], ['78563412', 0xdf8a8a2b], ['0102030405060708', 0xa3141bda]]) {
    assert.equal(cacheCrc(Buffer.from(hex, 'hex')), value);
  }
});

test('save answers HE cache requests before accepting SAVE_END', async () => {
  const fixtureState = fixture([Buffer.from([0, 0xc9]), Buffer.from([0, 0xca]), Buffer.from([0, 0xfe])]);
  const data = sections();
  data.get(25)[408] = 99;
  const result = await saveDeviceMemory(fixtureState.device, data, { requireCrc: true });
  assert.deepEqual(fixtureState.sent.map(payload => [...payload.subarray(0, 3)]), [[8, 0xf2, 0], [8, 0xc9, 0], [8, 0xca, 0]]);
  assert.equal(fixtureState.sent[1].readUInt32LE(3), cacheCrc(data.get(25).subarray(0, 980)));
  assert.equal(result.acknowledged, true);
  assert.equal(result.persistenceVerified, false);
});

test('save skips INIT reports queued by a readback before the CRC request', async () => {
  const transfer = Array.from({ length: 300 }, () => Buffer.from([8, 0, 2]));
  const fixtureState = fixture([...transfer, Buffer.from([0, 0xc9]), Buffer.from([0, 0xfe])]);
  const result = await saveDeviceMemory(fixtureState.device, sections(), { requireCrc: true, timeoutMs: 500 });
  assert.equal(result.acknowledged, true);
});

test('a write acknowledgement without SAVE_END fails the save', async () => {
  for (const responses of [[], [Buffer.from([0, 0xc9])], [Buffer.from([8, 0, 25])]]) {
    const fixtureState = fixture(responses);
    await assert.rejects(() => saveDeviceMemory(fixtureState.device, sections(), { requireCrc: true, timeoutMs: 20 }), /did not confirm SAVE_END/);
  }
});

test('a queued CRC request is answered without draining the stream', async () => {
  const fixtureState = fixture([Buffer.from([0, 0xc9]), Buffer.from([0, 0xc9]), Buffer.from([0, 0xfe])]);
  const result = await saveDeviceMemory(fixtureState.device, sections(), { requireCrc: true });
  assert.equal(result.acknowledged, true);
  assert.deepEqual(fixtureState.sent[1], fixtureState.sent[2]);
});

test('SAVE_END cannot acknowledge an HE save without a CRC exchange', async () => {
  const fixtureState = fixture([Buffer.from([0, 0xfe])]);
  await assert.rejects(() => saveDeviceMemory(fixtureState.device, sections(), { requireCrc: true, timeoutMs: 20 }), /did not confirm SAVE_END/);
});

test('missing CRC sections fail before opening the report stream', async () => {
  const fixtureState = fixture([]);
  await assert.rejects(() => saveDeviceMemory(fixtureState.device, new Map(), { requireCrc: true }), /Missing device-memory backup/);
  assert.equal(fixtureState.sent.length, 0);
});

test('tolerant settings save reports a sent command without SAVE_END', async () => {
  const fixtureState = fixture([]);
  const result = await saveDeviceMemory(fixtureState.device, sections(), { tolerant: true, timeoutMs: 20 });
  assert.equal(result.acknowledged, true);
  assert.equal(result.completion, 'SENT');
  assert.equal(result.confirmed, false);
});