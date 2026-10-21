'use strict';
const { Buffer } = require('buffer');
// Layout verified with Marshal.OffsetOf in the original MMPanel process.
const ROWS=5,COLS=14,RECORD_SIZE=68,PROFILE_SIZE=8+ROWS*COLS*RECORD_SIZE;
const {PROG_CMD}=require('./m6up-commands.cjs');
// Original QC64 DKSMouseCmd_Execute values; names verified in the live process.
const DKS_MOUSE_ACTIONS=Object.freeze({
  'left-button':{label:'Left mouse button',button:1,x:0,y:0,wheel:0},
  'right-button':{label:'Right mouse button',button:2,x:0,y:0,wheel:0},
  'middle-button':{label:'Middle mouse button',button:4,x:0,y:0,wheel:0},
  'wheel-up':{label:'Scroll up',button:0,x:0,y:0,wheel:1},
  'wheel-down':{label:'Scroll down',button:0,x:0,y:0,wheel:-1},
  up:{label:'Move mouse up',button:0,x:0,y:-8,wheel:0},
  down:{label:'Move mouse down',button:0,x:0,y:8,wheel:0},
  left:{label:'Move mouse left',button:0,x:-8,y:0,wheel:0},
  right:{label:'Move mouse right',button:0,x:8,y:0,wheel:0}
});
function parseDks(bytes){
  const dks={type:bytes[0],row:bytes[1],col:bytes[2],button:bytes[3],x:bytes.readInt16LE(4),y:bytes.readInt16LE(6),wheel:bytes.readInt8(8),interval:bytes.readUInt16LE(10)};
  dks.mouseAction=dks.type===1?(Object.keys(DKS_MOUSE_ACTIONS).find(id=>['button','x','y','wheel'].every(f=>DKS_MOUSE_ACTIONS[id][f]===dks[f]))||null):null;
  return dks;
}
function parseMacroKey(record){
  if(!Buffer.isBuffer(record)||record.length!==68)throw new Error('Expected 68-byte key record');
  // QC64 prog_key_t is exactly 32 bytes at record offset 20:
  // ushort, byte, byte, ushort, two reserved bytes, six uint32 words.
  return {steps:record.readUInt16LE(20),isRoll:record[22],isCombo:record[23],rollDelay:record.readUInt16LE(24),reserved:[record[26],record[27]],packed:[0,1,2,3,4,5].map(i=>record.readUInt32LE(28+i*4))};
}
function buildDksRecord(original,target,interval){
  if(!Number.isInteger(interval)||interval<10||interval>100)throw new Error('DKS interval must be an integer from 10 to 100');
  const record=Buffer.from(original);
  if(typeof target==='string'){
    if(!Object.hasOwn(DKS_MOUSE_ACTIONS,target))throw new Error('Unknown DKS mouse action');
    const action=DKS_MOUSE_ACTIONS[target];record[0]=1;record[3]=action.button;
    record.writeInt16LE(action.x,4);record.writeInt16LE(action.y,6);record.writeInt8(action.wheel,8);
  }else{record[0]=0;record[1]=byte(target.row,'target row',5);record[2]=byte(target.col,'target column',13);}
  record.writeUInt16LE(interval,10);return record;
}
function parseProgrammingProfile(raw) {
  if(!Buffer.isBuffer(raw)||raw.length!==4776)throw new Error('Expected complete 4776-byte programming transfer');
  const keys=[];
  for(let i=0;i<ROWS*COLS;i++) {
    const bytes=raw.subarray(8+i*RECORD_SIZE,8+(i+1)*RECORD_SIZE);
    keys.push({row:Math.floor(i/COLS),col:i%COLS,mode:bytes[0],locked:bytes[1],
      media:{index:bytes[2],data:bytes[3]},layer:{layer:bytes[4],reserved:[bytes[5],bytes[6],bytes[7]]},
      modify:{type:bytes[8],row:bytes[9],col:bytes[10],button:bytes[11],x:bytes.readInt16LE(12),y:bytes.readInt16LE(14),wheel:bytes.readInt8(16),mode:bytes[17],interval:bytes.readUInt16LE(18)},
      hotKey:{type:bytes[17],interval:bytes[18]},
      macroSteps:bytes.readUInt16LE(20),macro:parseMacroKey(bytes),snap:{row:bytes[64],col:bytes[65]},
      cancel:{row:bytes[66],col:bytes[67]},dks:parseDks(bytes.subarray(52,64)),record:Buffer.from(bytes)});
  }
  // Original QC64 full_key_prog calls this field uid, not a checksum.
  return {uid:raw.readUInt32LE(0),allSteps:raw.readUInt32LE(4),keys};
}
function byte(value,name,max=255) {if(!Number.isInteger(value)||value<0||value>max)throw new RangeError(`Invalid ${name}`);return value;}
function header(key,layer,allSteps,mode) {
  byte(key.row,'row',4);byte(key.col,'column',13);byte(key.locked,'lock',15);byte(layer,'profile',1);
  byte(allSteps,'macro step count',65535);
  const b=Buffer.alloc(20);b.set([8,3,1,layer]);b.writeUInt16LE(allSteps,4);
  b[6]=key.row;b[7]=key.col;b[8]=(key.locked<<4)|mode;return b;
}
function encodePair(key,layer,allSteps,mode,target,command=1) {
  if(mode!==5&&mode!==6)throw new Error('Expected Snap Tap or SOCD mode');
  if(command!==1&&command!==11)throw new Error('Invalid pair command');
  // Stored partner rows are 1-based; physical source rows are 0-based.
  byte(target.row,'partner row',5);if(!target.row)throw new RangeError('Partner row must be 1-based');
  byte(target.col,'partner column',13);
  const b=header(key,layer,allSteps,mode);b[2]=command;b[10]=target.row;b[11]=target.col;return b;
}
function encodeAdCancel(key,layer,allSteps) {
  const b=header(key,layer,allSteps,6);b[2]=12;return b;
}
function encodeModRestore(key,layer,allSteps) {
  if(key.mode!==0||!Buffer.isBuffer(key.record)||key.record.length!==RECORD_SIZE)
    throw new Error('Standard-mode record required');
  const m=key.record.subarray(8,20),b=header(key,layer,allSteps,0);b[9]=m[0];
  if(m[0]===0){b[10]=m[1];b[11]=m[2];}
  else if(m[0]===1){b[10]=m[3];m.copy(b,11,4,9);}
  else throw new Error('Unsupported standard key type');
  b[16]=m[9];m.copy(b,17,10,12);return b;
}
function encodeFullModRestore(key,layer,allSteps) {
  // Each command updates only its own keyboard/mouse fields. Restore the
  // inactive branch first, then put the original type and shared fields back.
  const original=encodeModRestore(key,layer,allSteps);
  const record=Buffer.from(key.record);record[8]=1-record[8];
  const inactive=encodeModRestore({...key,record},layer,allSteps);
  return [inactive,original];
}
function encodeStandardRemap(key,layer,allSteps,target){
  if(!key||!Number.isInteger(key.row)||!Number.isInteger(key.col))throw new Error('Source key required');
  if(!target||!Number.isInteger(target.row)||!Number.isInteger(target.col)||target.row<0||target.row>5||target.col<0||target.col>20)throw new RangeError('Invalid remap target');
  if(![0,1].includes(layer)||!Number.isInteger(allSteps)||allSteps<0||allSteps>65535)throw new RangeError('Invalid programming profile');
  const b=Buffer.alloc(20);b.set([8,3,1,layer]);b.writeUInt16LE(allSteps,4);b[6]=key.row;b[7]=key.col;b[8]=((key.locked||0)<<4);b[10]=target.row+1;b[11]=target.col;return b;
}
function encodeModify(key,layer,allSteps,modify){
  if(!key||!Number.isInteger(key.row)||!Number.isInteger(key.col))throw new Error('Source key required');
  if(![0,1].includes(layer)||!Number.isInteger(allSteps)||allSteps<0||allSteps>65535)throw new Error('Invalid programming profile');
  if(!modify||![0,1].includes(modify.type))throw new Error('Modify type must be keyboard or mouse');
  const b=header(key,layer,allSteps,0);b[9]=modify.type;
  if(modify.type===0){byte(modify.row,'target row',5);byte(modify.col,'target column',20);b[10]=modify.row+1;b[11]=modify.col;}
  else {byte(modify.button,'mouse button');if(!Number.isInteger(modify.wheel)||modify.wheel<-128||modify.wheel>127)throw new RangeError('Invalid mouse wheel');if(!Number.isInteger(modify.x)||modify.x<-32768||modify.x>32767||!Number.isInteger(modify.y)||modify.y<-32768||modify.y>32767)throw new RangeError('Invalid mouse movement');b[10]=modify.button;b.writeInt16LE(modify.x,11);b.writeInt16LE(modify.y,13);b.writeInt8(modify.wheel,15);}
  byte(modify.mode??0,'modify mode');byte(modify.interval??0,'modify interval',65535);
  b[16]=modify.mode??0;b.writeUInt16LE(modify.interval??0,17);
  return b;
}
function encodeLayer(key,layer,allSteps,targetLayer){
  if(!key||!Number.isInteger(key.row)||!Number.isInteger(key.col))throw new Error('Source key required');
  if(![0,1].includes(layer)||!Number.isInteger(allSteps)||allSteps<0||allSteps>65535)throw new Error('Invalid programming profile');
  byte(targetLayer,'target layer',2);const b=header(key,layer,allSteps,0);b[8]=((key.locked||0)<<4)|3;b[9]=targetLayer;return b;
}
function encodeLayerRestore(key,layer,allSteps){
  // QC64 SendFnData writes the stored byte directly (IL0x55b..563).
  // Inactive layer_num is 255 on the real device; this is not a UI target.
  const b=encodeLayer(key,layer,allSteps,0);b[9]=byte(key.layer?.layer,'stored layer');return b;
}
function encodeMt10(key,layer,mt,command=PROG_CMD.MT10_SET_ON){
  if(!key||!Number.isInteger(key.row)||!Number.isInteger(key.col))throw new Error('Source key required');
  if(![0,1].includes(layer)||!Number.isInteger(command)||![1,2,3,4,13].includes(command))throw new Error('Invalid MT command');
  for(const [name,max] of [['shortRow',4],['longRow',4],['shortCol',13],['longCol',13]])byte(mt?.[name],name,max);
  for(const name of ['shortDelay','longDelay']){if(!Number.isInteger(mt?.[name])||mt[name]<0||mt[name]>65535)throw new RangeError(`Invalid ${name}`);}
  const b=Buffer.alloc(20);b.set([8,3,command,layer,0,0,key.row,key.col]);b[8]=0;b[9]=mt.shortRow;b[10]=mt.shortCol;b[11]=mt.longRow;b[12]=mt.longCol;b.writeUInt16LE(mt.shortDelay,13);b.writeUInt16LE(mt.longDelay,15);return b;
}
function encodeProgrammingReset(key,layer,allSteps){
  if(!key||!Number.isInteger(key.row)||!Number.isInteger(key.col))throw new Error('Source key required');
  if(![0,1].includes(layer)||!Number.isInteger(allSteps)||allSteps<0||allSteps>65535)throw new Error('Invalid programming profile');
  const b=header(key,layer,allSteps,0);b[2]=PROG_CMD.PROG_SINGLE_RESET;return b;
}
function encodeHotKey(key,layer,allSteps,interval){
  if(!key||!Number.isInteger(key.row)||!Number.isInteger(key.col))throw new Error('Source key required');
  if(![0,1].includes(layer)||!Number.isInteger(allSteps)||allSteps<0||allSteps>65535)throw new RangeError('Invalid programming profile');
  if(!Number.isInteger(interval)||interval<0||interval>255)throw new RangeError('Invalid HotKey interval');
  const b=header(key,layer,allSteps,0);
  // Observed MMPanel HotKey write/readback: command index 16 selects
  // HotKey, then index 17 stores the one-byte repeat interval.
  b[16]=2;b[17]=interval;return b;
}
function encodeMedia(key,layer,allSteps,index,data){
  if(!key||!Number.isInteger(key.row)||!Number.isInteger(key.col))throw new Error('Source key required');
  if(![0,1].includes(layer)||!Number.isInteger(allSteps)||allSteps<0||allSteps>65535)throw new Error('Invalid programming profile');
  byte(index,'media index');byte(data,'media data');
  const b=header(key,layer,allSteps,0);
  // QC64 SendMediaData IL 0x341..349 and 0xf7..ff write index/data at 9/10.
  // The vendor programming command carries the same pair at command offsets 9..10.
  b[8]=((key.locked||0)<<4)|2;b[9]=index;b[10]=data;
  return b;
}
function countMacroSteps(keys){return keys.reduce((sum,key)=>sum+(key.mode===1?key.macroSteps:0),0);}
function encodeDks(key,layer,allSteps,dks) {
  if(!Buffer.isBuffer(dks)||dks.length!==12)throw new Error('Expected 12-byte DKS record');
  const b=header(key,layer,allSteps,4);b[9]=dks[0];
  if(dks[0]===0){byte(dks[1],'DKS target row',5);byte(dks[2],'DKS target column',13);b[10]=dks[1];b[11]=dks[2];}
  else if(dks[0]===1){b[10]=dks[3];dks.copy(b,11,4,9);}
  else throw new Error('Unsupported DKS target type');
  dks.copy(b,17,10,12);
  // Original get_ApplyToAll sets byte19. Individual writes must leave it zero.
  return b;
}
function encodeKeyEnabled(key,layer,allSteps,enabled){
  if(typeof enabled!=='boolean'||![0,1].includes(key?.locked))throw new Error('Invalid key enabled state');
  const next={...key,locked:enabled?0:1};
  if(key.mode===0)return encodeStandardRemap(next,layer,allSteps,{row:key.snap.row>0?key.snap.row-1:key.snap.row,col:key.snap.col});
  if(key.mode===2)return encodeMedia(next,layer,allSteps,key.media.index,key.media.data);
  if(key.mode===3)return encodeLayer(next,layer,allSteps,key.layer.layer);
  if(key.mode===4)return encodeDks(next,layer,allSteps,key.record.subarray(52,64));
  if(key.mode===5||key.mode===6)return encodePair(next,layer,allSteps,key.mode,key.mode===5?key.snap:key.cancel);
  throw new Error('Unsupported assignment for key enable/disable');
}
function encodeDksRestore(key,layer,allSteps){
  const original=key.record.subarray(52,64),inactive=Buffer.from(original);
  if(![0,1].includes(original[0]))throw new Error('Unknown original DKS type');
  inactive[0]=1-original[0];
  // Firmware retains inactive keyboard/mouse fields: restore both representations.
  return [encodeDks(key,layer,allSteps,inactive),encodeDks(key,layer,allSteps,original)];
}
module.exports={parseProgrammingProfile,parseMacroKey,encodePair,encodeModRestore,encodeFullModRestore,encodeStandardRemap,encodeModify,encodeLayer,encodeLayerRestore,encodeMt10,encodeAdCancel,encodeProgrammingReset,encodeHotKey,encodeMedia,encodeDks,encodeDksRestore,encodeKeyEnabled,countMacroSteps,PROFILE_SIZE,DKS_MOUSE_ACTIONS,buildDksRecord,parseDks};
