'use strict';
const { Buffer } = require('buffer');
const {parseProgrammingProfile,encodePair,encodeDks,encodeFullModRestore,encodeDksRestore,encodeAdCancel,buildDksRecord}=require('./key-programming.cjs');
const indices=[16,29,30,31],partners=new Map([[16,30],[30,16],[29,31],[31,29]]);
function preparePresetOff(raw,layer){
  if(![0,1].includes(layer))throw Error('Select M1 or M2');const profile=parseProgrammingProfile(raw),expected=Buffer.from(raw),restore=[];
  for(const key of profile.keys){const index=key.row*14+key.col;if(!indices.includes(index)&&[5,6].includes(key.mode)){const target=key.mode===5?key.snap:key.cancel;if(indices.includes((target.row-1)*14+target.col))throw Error('Disable the custom pair linked to WASD first');}}
  for(const index of indices){const key=profile.keys[index],partner=profile.keys[partners.get(index)],m=key.modify;if(![0,4,5,6].includes(key.mode)||key.locked||m.type!==0||m.row!==key.row+1||m.col!==key.col||m.mode!==0||m.interval!==0)throw Error('Restore custom WASD assignments before using preset Off');if(key.mode===4&&(key.dks.type!==0||key.dks.row!==partner.row+1||key.dks.col!==partner.col||key.dks.interval!==20))throw Error('Custom DKS on WASD must be disabled in Programming');if(key.mode===5&&(![29,31].includes(index)||key.snap.row!==partner.row+1||key.snap.col!==partner.col||profile.keys[partners.get(index)].mode!==5))throw Error('Custom Snap on WASD must be disabled in Programming');if(key.mode===6&&(![29,31].includes(index)||key.cancel.row!==partner.row+1||key.cancel.col!==partner.col))throw Error('Custom AD Cancel on WASD must be disabled in Programming');if(key.mode===0&&(key.snap.row!==key.row+1||key.snap.col!==key.col))throw Error('Custom WASD remapping prevents preset Off');const offset=8+index*68;expected[offset]=0;expected[offset+64]=key.row+1;expected[offset+65]=key.col;const commands=[...encodeDksRestore(key,layer,profile.allSteps),encodePair(key,layer,profile.allSteps,5,key.snap),...encodeFullModRestore({...key,mode:0},layer,profile.allSteps)];if(key.mode===4)commands.push(...encodeDksRestore(key,layer,profile.allSteps));if(key.mode===5)commands.push(encodePair(key,layer,profile.allSteps,5,key.snap));if(key.mode===6)commands.push(encodeAdCancel(key,layer,profile.allSteps));restore.push(...commands);}
  const command=Buffer.alloc(20);command.set([8,3,10,0]);command.writeUInt16LE(profile.allSteps,4);return {command,expected,restore,changed:!expected.equals(raw)};
}
function prepareQuickPreset(raw,layer,preset){
  if(!['off','dks','snap','cl'].includes(preset))throw Error('Select DKS, SNAP, CL or Off');
  const plan=preparePresetOff(raw,layer);
  if(preset==='off')return plan;
  const profile=parseProgrammingProfile(raw),expected=Buffer.from(raw),commands=[];
  if(preset==='cl'){
    for(const index of [29,31]){
      const key=profile.keys[index],partner=profile.keys[partners.get(index)],offset=8+index*68;
      commands.push(encodeAdCancel(key,layer,profile.allSteps));
      expected[offset]=6;expected[offset+66]=partner.row+1;expected[offset+67]=partner.col;
    }
    return {...plan,commands,command:commands[0],expected,changed:!expected.equals(raw)};
  }
  for(const index of preset==='snap'?[29,31]:indices){
    const key=profile.keys[index],partner=profile.keys[partners.get(index)],offset=8+index*68,target={row:partner.row+1,col:partner.col};
    if(preset==='snap'){
      commands.push(encodePair(key,layer,profile.allSteps,5,target,11));
      expected[offset]=5;expected[offset+64]=target.row;expected[offset+65]=target.col;
    }else{
      const dks=buildDksRecord(key.record.subarray(52,64),target,20);
      commands.push(encodeDks(key,layer,profile.allSteps,dks));
      expected[offset]=4;dks.copy(expected,offset+52);
    }
  }
  return {...plan,commands,expected,changed:!expected.equals(raw)};
}
module.exports={preparePresetOff,prepareQuickPreset};
