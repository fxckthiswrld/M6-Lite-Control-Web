'use strict';
const { Buffer } = require('buffer');
function parseCalibration(raw){
  if(!Buffer.isBuffer(raw)||raw.length!==420)throw Error('Expected 420 calibration bytes');
  return Array.from({length:70},(_,index)=>{const o=index*6,min=raw.readUInt16LE(o+2),max=raw.readUInt16LE(o+4);return {row:Math.floor(index/14),col:index%14,model:raw[o],reserved:raw[o+1],min,max,rangeStatus:min===2000&&max===2200?'not-calibrated':min===0&&max===0?'empty':max>min?'ok':'error'};});
}
function visibleCalibrationRecords(records,keyboardLayout){
  if(!Array.isArray(records)||!Array.isArray(keyboardLayout))throw Error('Invalid calibration layout');
  return keyboardLayout.map(key=>{const record=records.find(r=>r.row===key.row&&r.col===key.col);if(!record)throw Error(`Missing calibration record for ${key.id}`);return {...key,...record};});
}
function compareCalibration(before,after,keyboardLayout){
  const oldRecords=parseCalibration(before),newRecords=parseCalibration(after),visible=visibleCalibrationRecords(newRecords,keyboardLayout),changedRecords=[];
  for(let index=0;index<70;index++){const o=index*6;if(before.subarray(o,o+6).equals(after.subarray(o,o+6)))continue;const old=oldRecords[index],current=newRecords[index],key=keyboardLayout.find(k=>k.row===current.row&&k.col===current.col);changedRecords.push({index,id:key?.id??null,label:key?.label??null,before:old,after:current,rangeChanged:old.min!==current.min||old.max!==current.max,modelChanged:old.model!==current.model,reservedChanged:old.reserved!==current.reserved});}
  const changedKeys=changedRecords.filter(r=>r.id!==null);return {unchanged:changedRecords.length===0,changedRecords,changedKeys,unchangedKeyCount:visible.length-changedKeys.length,hiddenRecordChanges:changedRecords.filter(r=>r.id===null).length,savedOkCount:visible.filter(r=>r.rangeStatus==='ok').length};
}
module.exports={parseCalibration,visibleCalibrationRecords,compareCalibration};
