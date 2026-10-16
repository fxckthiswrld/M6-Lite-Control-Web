'use strict';
// Internal send-queue prefix recovered from JIT SendMagCfg; NOT a HID report.
// Values are raw device units. Millimetre conversion and USB framing are unknown.
function integer(value, max, name) {
  if (!Number.isInteger(value) || value < 0 || value > max)
    throw new RangeError(`${name} must be an integer from 0 to ${max}`);
  return value;
}
function encodeMagCommandRaw(config) {
  const b = Buffer.alloc(19);
  b[0] = 8;
  b[1] = 0x31;
  for (const [field, offset] of [['command',2],['layer',3],['row',4],['col',5],['rtOn',6]])
    b[offset] = integer(config[field], 255, field);
  for (const [field, offset] of [['head',7],['trigger',9],['release',11],['fixedDown',13],['fixedUp',15],['bottom',17]])
    b.writeUInt16LE(integer(config[field], 65535, field), offset);
  return b;
}
module.exports = { encodeMagCommandRaw };
