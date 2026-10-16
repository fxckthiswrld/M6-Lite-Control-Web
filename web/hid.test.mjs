import test from 'node:test';import assert from 'node:assert/strict';import {M6Hid} from './hid.js';
test('adapter starts disconnected',()=>assert.equal(new M6Hid().connected,false));
test('adapter rejects writes before connection',()=>assert.rejects(()=>new M6Hid().send(new Uint8Array(20)),/Сначала подключите/));
