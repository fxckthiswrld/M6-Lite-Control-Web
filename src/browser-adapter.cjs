'use strict';
const {Buffer}=require('buffer');
const {parseHeProfile,encodeHeWrite}=require('./he-protocol.cjs');
const prog=require('./key-programming.cjs');
const layout=require('../web/keyboard-layout.json');
const OUT=Buffer.from('8e96ce6af272994858612758e89a7f0195eeed2f','hex');
const IN=Buffer.from('6a6d64663f2ef0430a41ea8f2bfce0e7d5527ba5','hex');
const VID=0x2233,PID=0x006b;
const xor=(value,mask)=>Buffer.from(value.map((v,i)=>v^mask[i]));
const clone=value=>JSON.parse(JSON.stringify(value));
const backNames={2:'Normal',3:'Breath',4:'Gradient',5:'Stream',6:'Star',7:'Roll'};
const backSpeed={3:[1500,3000],4:[5000,20000],5:[2000,6000],6:[2000,5000],7:[3007,6000]};
const underModes={3:{name:'Breath',offset:2},4:{name:'Gradient',offset:10},5:{name:'Stream',offset:18},6:{name:'Star',offset:26},7:{name:'Normal',offset:50}};
function backState(raw){const mode=raw[0],offset=8+(mode-2)*10,r=backSpeed[mode];return {mode,name:backNames[mode]||'Unknown',enabled:raw[5]===1,canEditEnabled:true,canSwitch:[2,3,4,5,6,7].includes(mode),supportedModes:[2,3,4,5,6,7],canEditColor:[2,3,5,6,7].includes(mode),supportsCustomRgb:[2,3,5,7].includes(mode),customRgb:raw[offset+2]===1,color:'#'+raw.subarray(offset+3,offset+6).toString('hex').toUpperCase(),canEditSpeed:!!r,...(r?{speed:raw.readUInt16LE(offset+6),speedMinimum:r[0],speedMaximum:r[1]}:{}),canEditDirection:[5,7].includes(mode),reverse:[5,7].includes(mode)?raw[offset]===1:false};}
function underState(raw){const mode=raw[0],m=underModes[mode],r={3:[1500,3000],4:[5000,20000],5:[2000,6000],6:[2000,4000]}[mode];return {mode,name:m?.name||'Unknown',enabled:true,sync:1,brightness:raw[10],canSwitch:!!m,supportedModes:[3,4,5,6,7],canEditEnabled:true,canEditSync:true,canEditColor:[3,7].includes(mode),supportsCustomRgb:mode===3,customRgb:m?raw[m.offset]===1:false,color:m?'#'+raw.subarray(m.offset+1,m.offset+4).toString('hex').toUpperCase():'#000000',canEditSpeed:!!r,...(r?{speed:raw.readUInt16LE(m.offset+4),speedMinimum:r[0],speedMaximum:r[1]}:{})};}
function configPayload(raw){const p=Buffer.alloc(20);p.set([8,17]);raw.copy(p,2,0,18);return p;}
function display(key){return {...key,rtOn:!!key.rtOn,...Object.fromEntries(['head','trigger','release','fixedDown','fixedUp','bottom'].map(f=>[f,key[f]/500]))};}
class BrowserDevice {
  constructor(){this.handle=null;}
  get connected(){return !!this.handle?.opened;}
  async connect(){if(!globalThis.navigator?.hid)throw Error('WebHID is unavailable. Use Chrome or Edge over HTTPS or localhost.');const list=await navigator.hid.requestDevice({filters:[{vendorId:VID,productId:PID}]});if(!list.length)throw Error('No M6 Lite+ device selected.');this.handle=list[0];await this.handle.open();return this.handle;}
  async send(payload){if(!this.connected)throw Error('Connect the keyboard first.');await this.handle.sendReport(4,xor(Buffer.from(payload),OUT));}
  async readInit(kind){if(!this.connected)throw Error('Connect the keyboard first.');const d=this.handle;return new Promise(async(resolve,reject)=>{let total=null;const parts=new Map();const finish=()=>{clearTimeout(timer);d.removeEventListener('inputreport',on)};const timer=setTimeout(()=>{finish();reject(Error(`Device read timed out (${parts.size}/${total??'?'} packets)`))},4000);const on=event=>{if(event.reportId!==4)return;const report=Buffer.from(event.data.buffer,event.data.byteOffset,event.data.byteLength);const p=report[1]===0xbf?report:Buffer.from(report.map((v,i)=>v^IN[i]));if(p[0]!==8||p[1]!==0||p[2]!==kind)return;const length=p.readUInt16LE(3),sequence=p.readUInt16LE(5);if(!length||sequence<1||sequence>length)return;total??=length;parts.set(sequence,p.subarray(8));if(parts.size===total){finish();resolve(Buffer.concat(Array.from({length:total},(_,i)=>parts.get(i+1))))}};d.addEventListener('inputreport',on);try{const request=Buffer.alloc(20);request.set([8,0,kind]);await this.send(request)}catch(error){finish();reject(error)}})}
}
class BrowserAdapter {
  constructor(){this.device=new BrowserDevice();this.layer=0;}
  async connect(){return this.device.connect();}
  async readProfile(layer){this.layer=layer;const raw=await this.device.readInit(25+layer);if(raw.length!==984)throw Error('Incomplete HE profile');return {layer,keys:parseHeProfile(raw).keys.map(display),layout};}
  async heWrite(request,all=false){const layer=request.layer??this.layer;const before=parseHeProfile(await this.device.readInit(25+layer));const selected=all?before.keys:before.keys.filter(key=>(request.ids||[request.id]).includes(`${key.row}:${key.col}`));for(const key of selected){const next={...key,...request,row:key.row,col:key.col};await this.device.send(encodeHeWrite({...next,...Object.fromEntries(['head','trigger','release','fixedDown','fixedUp','bottom'].map(f=>[f,Math.round(next[f]*500)]))},layer));}return this.readProfile(layer);}
  async saveSelected(request){const profile=await this.heWrite(request,false);return {key:profile.keys.find(k=>`${k.row}:${k.col}`===request.id),verified:true};}
  async applyAll(request){return this.heWrite(request,true);}
  async readProgramming(layer){const raw=await this.device.readInit(layer?4:2);const parsed=prog.parseProgrammingProfile(raw);return {layer,keys:parsed.keys.map(({record,...key})=>key)};}
  async programmingWrite(layer,id,encoder){const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw),source=parsed.keys.find(k=>`${k.row}:${k.col}`===id);if(!source)throw Error('Select a physical source key');await this.device.send(encoder(source,parsed));return this.readProgramming(layer);}
  async setPair({layer,mode,first,second}){const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw),a=parsed.keys.find(k=>`${k.row}:${k.col}`===first),b=parsed.keys.find(k=>`${k.row}:${k.col}`===second);if(!a||!b||first===second)throw Error('Select two different physical keys');await this.device.send(prog.encodePair(a,layer,parsed.allSteps,mode,{row:b.row+1,col:b.col}));await this.device.send(prog.encodePair(b,layer,parsed.allSteps,mode,{row:a.row+1,col:a.col}));return this.readProgramming(layer);}
  async setRemap({layer,source,target}){return this.programmingWrite(layer,source,(key,p)=>prog.encodeStandardRemap(key,layer,p.allSteps,layout.find(k=>k.id===target)));}
  async setHotKey({layer,id,interval}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeHotKey(key,layer,p.allSteps,interval));}
  async setMedia({layer,id,index,data}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeMedia(key,layer,p.allSteps,index,data));}
  async setModify({layer,id,modify}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeModify(key,layer,p.allSteps,modify));}
  async setLayerAssignment({layer,id,targetLayer}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeLayer(key,layer,p.allSteps,targetLayer));}
  async resetProgrammingKey({layer,id}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeProgrammingReset(key,layer,p.allSteps));}
  async setKeyEnabled({layer,id,enabled}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeKeyEnabled(key,layer,p.allSteps,enabled));}
  async setDks({layer,id,target,interval}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeDks(key,layer,p.allSteps,prog.buildDksRecord(key.record,typeof target==='string'?target:layout.find(k=>k.id===target),interval)));}
  async setDksAll({layer,target,interval}){const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw);for(const key of parsed.keys)await this.device.send(prog.encodeDks(key,layer,parsed.allSteps,prog.buildDksRecord(key.record,typeof target==='string'?target:layout.find(k=>k.id===target),interval)));return this.readProgramming(layer);}
  async setDksWasd({layer,enabled=true}){if(!enabled)return this.readProgramming(layer);const pairs=[['1:2','3:2'],['3:2','1:2'],['2:1','2:3'],['2:3','2:1']];for(const [id,target] of pairs)await this.setDks({layer,id,target,interval:20});return this.readProgramming(layer);}
  async returnToStandard({layer,id}){const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw),key=parsed.keys.find(k=>`${k.row}:${k.col}`===id);if(!key)throw Error('Select a physical source key');await this.device.send(prog.encodeModRestore({...key,mode:0},layer,parsed.allSteps));return this.readProgramming(layer);}
  async calibrationCommand(command){const p=Buffer.alloc(20);p.set([8,48,command]);await this.device.send(p);return {command};}
  async calibrateSelected(id){return this.calibrationCommand(1,id);}
  async calibrationState(){return {active:false,phase:'idle'};}
  async readDeviceSettings(){const raw=await this.device.readInit(1);return {raw:Array.from(raw),performanceMode:raw[0],fpsEnhance:raw[1],canEditPerformance:false,canEditFps:false};}
  async saveToDeviceMemory(){const p=Buffer.alloc(20);p.set([8,0xf2]);await this.device.send(p);return {acknowledged:true};}
  async readBrightness(){const raw=await this.device.readInit(17);return {brightness:raw[3]};}
  async setBrightness(value){const raw=await this.device.readInit(17);if(!Number.isInteger(value)||value<0||value>255)throw Error('Brightness must be an integer from 0 to 255');raw[3]=value;await this.device.send(configPayload(raw));return this.readBrightness();}
  async readBackLight(){return backState(await this.device.readInit(6));}
  async setBackLightMode(mode){const raw=await this.device.readInit(6);if(![2,3,4,5,6,7].includes(mode))throw Error('Unsupported Back Light mode');const p=Buffer.alloc(20);p.set([8,5,mode]);await this.device.send(p);return this.readBackLight();}
  async setBackLightEnabled(value){const raw=await this.device.readInit(17);raw[5]=value?1:0;await this.device.send(configPayload(raw));return this.readBackLight();}
  async setBackLightColor(request){const raw=await this.device.readInit(6),mode=request.mode??raw[0],offset=8+(mode-2)*10;if(!/^#[0-9a-f]{6}$/i.test(request.color))throw Error('Expected #RRGGBB');Buffer.from(request.color.slice(1),'hex').copy(raw,offset+3);if(mode!==6)raw[offset+2]=request.customRgb?1:0;const p=Buffer.alloc(20);p.set([8,5,mode]);raw.subarray(offset,offset+10).copy(p,4);await this.device.send(p);return this.readBackLight();}
  async setBackLightSpeed(request){const raw=await this.device.readInit(6),mode=request.mode??raw[0],offset=8+(mode-2)*10;raw.writeUInt16LE(request.speed,offset+6);const p=Buffer.alloc(20);p.set([8,5,mode]);raw.subarray(offset,offset+10).copy(p,4);await this.device.send(p);return this.readBackLight();}
  async setBackLightDirection(request){const raw=await this.device.readInit(6),mode=request.mode??raw[0],offset=8+(mode-2)*10;raw[offset]=request.reverse?1:0;const p=Buffer.alloc(20);p.set([8,5,mode]);raw.subarray(offset,offset+10).copy(p,4);await this.device.send(p);return this.readBackLight();}
  async readUnderLight(){return underState(await this.device.readInit(9));}
  async setUnderLightMode(mode){const raw=await this.device.readInit(9),m=underModes[mode];if(!m)throw Error('Unsupported Under Light mode');const p=Buffer.alloc(20);p.set([8,11,0,mode]);await this.device.send(p);return this.readUnderLight();}
  async setUnderLightBrightness(value){const raw=await this.device.readInit(17);if(!Number.isInteger(value)||value<0||value>255)throw Error('Brightness must be an integer from 0 to 255');raw[10]=value;await this.device.send(configPayload(raw));return this.readUnderLight();}
  async setUnderLightEnabled(value){const raw=await this.device.readInit(17);raw[9]=value?1:0;await this.device.send(configPayload(raw));return this.readUnderLight();}
  async setUnderLightSync(value){const raw=await this.device.readInit(17);raw[11]=value?1:0;await this.device.send(configPayload(raw));return this.readUnderLight();}
  async setUnderLightColor(request){const raw=await this.device.readInit(9),mode=request.mode??raw[0],m=underModes[mode];if(!m||!/^#[0-9a-f]{6}$/i.test(request.color))throw Error('Expected #RRGGBB');if(mode===3)raw[m.offset]=request.customRgb?1:0;Buffer.from(request.color.slice(1),'hex').copy(raw,m.offset+1);const p=Buffer.alloc(20);p.set([8,11,0,mode]);raw.subarray(m.offset,m.offset+8).copy(p,4);await this.device.send(p);return this.readUnderLight();}
  async setUnderLightSpeed(request){const raw=await this.device.readInit(9),mode=request.mode??raw[0],m=underModes[mode];if(!m)throw Error('Unsupported Under Light mode');raw.writeUInt16LE(request.speed,m.offset+4);const p=Buffer.alloc(20);p.set([8,11,0,mode]);raw.subarray(m.offset,m.offset+8).copy(p,4);await this.device.send(p);return this.readUnderLight();}
  async readSingleLight(){const raw=await this.device.readInit(7);return {enabled:true,canEnable:true,keys:layout.map(k=>{const o=(k.col*6+k.row)*10;return {id:k.id,label:k.label,enabled:raw[o]===1,mode:raw[o+1],color:'#'+raw.subarray(o+3,o+6).toString('hex').toUpperCase(),canEdit:true};})};}
  async setSingleLight(request){const raw=await this.device.readInit(7);if(Object.hasOwn(request,'active')){const cfg=await this.device.readInit(17);cfg[6]=request.active?1:0;await this.device.send(configPayload(cfg));}else{for(const id of request.keys||[]){const key=layout.find(k=>k.id===id);if(!key)continue;const o=(key.col*6+key.row)*10,p=Buffer.alloc(20);p.set([8,8,1,key.col,key.row]);raw.copy(p,5,o,o+6);p[5]=request.enabled?1:0;Buffer.from(request.color.slice(1),'hex').copy(p,8);await this.device.send(p);}}return this.readSingleLight();}
}
module.exports={BrowserAdapter,layout};
