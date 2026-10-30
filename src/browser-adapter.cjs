'use strict';
const {Buffer}=require('buffer');
const {parseHeProfile,encodeHeWrite,fields}=require('./he-protocol.cjs');
const prog=require('./key-programming.cjs');
const layout=require('../web/keyboard-layout.json');
const calibration=require('./calibration.cjs');
const telemetry=require('./calibration-telemetry.cjs');
const heFile=require('./he-profile-file.cjs');
const presets=require('./preset-off.cjs');
const deviceMemory=require('./device-memory.cjs');
const OUT=Buffer.from('8e96ce6af272994858612758e89a7f0195eeed2f','hex');
const IN=Buffer.from('6a6d64663f2ef0430a41ea8f2bfce0e7d5527ba5','hex');
const VID=0x2233,PID=0x006b;
const HID_FILTER={vendorId:VID,productId:PID};
const xor=(value,mask)=>Buffer.from(value.map((v,i)=>v^mask[i]));
const clone=value=>JSON.parse(JSON.stringify(value));
const backNames={2:'Normal',3:'Breath',4:'Gradient',5:'Stream',6:'Star',7:'Roll'};
const backSpeed={3:[1500,3000],4:[5000,20000],5:[2000,6000],6:[2000,5000],7:[3007,6000]};
const underModes={3:{name:'Breath',offset:2},4:{name:'Gradient',offset:10},5:{name:'Stream',offset:18},6:{name:'Star',offset:26},7:{name:'Normal',offset:50}};
function backState(raw){const mode=raw[0],offset=8+(mode-2)*10,r=backSpeed[mode];return {mode,name:backNames[mode]||'Unknown',enabled:raw[5]===1,canEditEnabled:true,canSwitch:[2,3,4,5,6,7].includes(mode),supportedModes:[2,3,4,5,6,7],canEditColor:[2,3,5,6,7].includes(mode),supportsCustomRgb:[2,3,5,7].includes(mode),customRgb:raw[offset+2]===1,color:'#'+raw.subarray(offset+3,offset+6).toString('hex').toUpperCase(),canEditSpeed:!!r,...(r?{speed:raw.readUInt16LE(offset+6),speedMinimum:r[0],speedMaximum:r[1]}:{}),canEditDirection:[5,7].includes(mode),reverse:[5,7].includes(mode)?raw[offset]===1:false};}
function underState(raw){const mode=raw[0],m=underModes[mode],r={3:[1500,3000],4:[5000,20000],5:[2000,6000],6:[2000,4000]}[mode];return {mode,name:m?.name||'Unknown',enabled:true,sync:1,brightness:raw[10],canSwitch:!!m,supportedModes:[3,4,5,6,7],canEditEnabled:true,canEditSync:true,canEditColor:[3,7].includes(mode),supportsCustomRgb:mode===3,customRgb:m?raw[m.offset]===1:false,color:m?'#'+raw.subarray(m.offset+1,m.offset+4).toString('hex').toUpperCase():'#000000',canEditSpeed:!!r,...(r?{speed:raw.readUInt16LE(m.offset+4),speedMinimum:r[0],speedMaximum:r[1]}:{})};}
function configPayload(raw){const p=Buffer.alloc(20);p.set([8,17]);raw.copy(p,2,0,18);return p;}
function backPayload(raw,mode){const offset=8+(mode-2)*10,record=raw.subarray(offset,offset+10),p=Buffer.alloc(20);p.set([8,5,mode]);if([5,7].includes(mode))p[3]=record[0];if(mode!==2)record.copy(p,4,6,8);if(mode===6)record.copy(p,6,8,10);if(mode!==4){p[8]=record[2];record.copy(p,9,3,6);}return p;}
function underPayload(raw,mode){const m=underModes[mode],record=raw.subarray(m.offset,m.offset+8),p=Buffer.alloc(20);p.set([8,11,0,mode]);if(mode!==7)record.copy(p,4,4,6);if([3,7].includes(mode)){p[8]=record[0];record.copy(p,9,1,4);}return p;}
function display(key){return {...key,rtOn:!!key.rtOn,...Object.fromEntries(['head','trigger','release','fixedDown','fixedUp','bottom'].map(f=>[f,key[f]/500]))};}
class BrowserDevice {
  constructor(){this.handle=null;this.reportId=4;this.lastDevice=null;this.telemetryHandle=null;this.telemetryListener=null;this.pendingDeviceFrames=[];this.reportStreams=0;this.reportListener=null;this.reportListenerHandle=null;}
  attachInputMonitor(){
    this.detachInputMonitor();
    const handle=this.handle;if(!handle)return;
    if(typeof handle.addEventListener!=='function')return;
    const on=event=>{try{const bytes=Buffer.from(event.data.buffer,event.data.byteOffset,event.data.byteLength);const report=bytes.length===21&&bytes[0]===this.reportId?bytes.subarray(1):bytes;if(report.length<20)return;const payload=report[1]===0xbf?report:Buffer.from(report.map((value,index)=>value^IN[index]));if((payload[0]===0||payload[0]===8)&&[0xc1,0xc2,0xc9,0xca].includes(payload[1])&&this.reportStreams===0&&this.pendingDeviceFrames.length<512)this.pendingDeviceFrames.push(Buffer.from(payload));}catch{}};
    handle.addEventListener('inputreport',on);
    this.reportListener=on;this.reportListenerHandle=handle;
  }
  detachInputMonitor(){
    if(this.reportListenerHandle&&this.reportListener){try{this.reportListenerHandle.removeEventListener('inputreport',this.reportListener);}catch{}}
    this.reportListener=null;this.reportListenerHandle=null;
  }
  get connected(){return !!this.handle?.opened;}
  outputReports(device){return (device.collections||[]).flatMap(collection=>collection.outputReports||[]);}
  choose(devices){const writable=device=>this.outputReports(device).some(report=>report.reportId===4);const usage12=device=>(device.collections||[]).some(collection=>collection.usagePage===0x000c);return devices.find(device=>writable(device)&&usage12(device))||devices.find(writable)||null;}
  candidates(devices){const writable=device=>this.outputReports(device).some(report=>report.reportId===4);const usable=devices.filter(writable);return usable.sort((a,b)=>Number(b===this.lastDevice)-Number(a===this.lastDevice));}
  details(){const reports=this.outputReports(this.handle);return {connected:true,vendorId:this.handle.vendorId,productId:this.handle.productId,productName:this.handle.productName||'M6 Lite+',interface:'MI02 control',outputReportIds:reports.map(report=>report.reportId),reportId:this.reportId};}
  async openSelected(selected){this.handle=selected;try{if(!this.handle.opened)await this.handle.open();}catch(error){if(this.handle===selected)this.handle=null;throw error;}this.lastDevice=selected;this.reportId=4;this.pendingDeviceFrames.length=0;this.attachInputMonitor();await new Promise(resolve=>setTimeout(resolve,150));return this.details();}
  async connect({request=true}={}){if(!globalThis.navigator?.hid)throw Error('WebHID is unavailable. Use Chrome or Edge over HTTPS or localhost.');const all=(await navigator.hid.getDevices()).filter(device=>device.vendorId===VID&&device.productId===PID);let selected=this.choose(all);if(!selected&&!request)throw Error('No paired M6 Lite+ keyboard was found. Click Connect keyboard to choose it.');if(!selected){const requested=await navigator.hid.requestDevice({filters:[HID_FILTER]});selected=this.choose(requested);if(!selected){const details=requested.map(device=>`${device.productName||'M6 Lite+'}: reports ${this.outputReports(device).map(report=>report.reportId).join(',')||'none'}`).join('; ');throw Error(`M6 Lite+ control interface with output report 4 was not selected. ${details||'Choose the configuration interface in the WebHID dialog.'}`);}}return this.openSelected(selected);}
  async reconnect({timeout=30000,interval=200}={}){if(!globalThis.navigator?.hid)throw Error('WebHID is unavailable. Use Chrome or Edge over HTTPS or localhost.');if(this.handle){try{if(this.handle.opened)await this.handle.close();}catch{}this.handle=null;}const hid=navigator.hid,pending=[];const onConnect=event=>{const device=event.device;if(device?.vendorId===VID&&device?.productId===PID&&!pending.includes(device))pending.push(device);};hid.addEventListener?.('connect',onConnect);const deadline=Date.now()+timeout;let lastError=null;try{while(Date.now()<deadline){try{const all=(await hid.getDevices()).filter(device=>device.vendorId===VID&&device.productId===PID);for(const candidate of this.candidates([...pending,...all])){try{return await this.openSelected(candidate);}catch(error){lastError=error;}}}catch(error){lastError=error;}await new Promise(resolve=>setTimeout(resolve,interval));}}finally{hid.removeEventListener?.('connect',onConnect);}throw Error(`Keyboard did not reconnect within ${timeout} ms${lastError?`: ${lastError.message}`:''}. Press Connect keyboard to retry.`);}
  async close(){const handle=this.handle;this.handle=null;this.detachInputMonitor();this.pendingDeviceFrames.length=0;if(handle?.opened){try{await handle.close();}catch{}}}
  invalidate(device=this.handle){if(!device||device===this.handle){this.detachInputMonitor();this.handle=null;}}
  startCalibrationTelemetry(callback){
    if(this.telemetryListener)return;
    const handle=this.handle;if(!handle)return;
    const listener=event=>{
      try{
        const bytes=Buffer.from(event.data.buffer,event.data.byteOffset,event.data.byteLength);
        const report=bytes.length===21&&bytes[0]===this.reportId?bytes.subarray(1):bytes;
        if(report.length<20)return;
        const payload=report[1]===0xbf?report:Buffer.from(report.map((v,i)=>v^IN[i]));
        if(payload[0]!==8||payload[1]!==0x30)return;
        callback(payload);
      }catch{}
    };
    handle.addEventListener('inputreport',listener);
    this.telemetryHandle=handle;this.telemetryListener=listener;
  }
  stopCalibrationTelemetry(){
    if(!this.telemetryListener)return;
    try{this.telemetryHandle?.removeEventListener('inputreport',this.telemetryListener);}catch{}
    this.telemetryListener=null;this.telemetryHandle=null;
  }
  async send(payload){if(!this.connected)throw Error('Connect the keyboard first.');const data=Uint8Array.from(xor(Buffer.from(payload),OUT));const handle=this.handle;try{await handle.sendReport(this.reportId,data);}catch(error){this.invalidate(handle);const reports=(handle.collections||[]).flatMap(collection=>collection.outputReports||[]);throw Error(`Failed to write HID report ${this.reportId} (${data.byteLength} bytes) on ${handle.productName||'M6 Lite+'}; available output reports: ${reports.map(report=>`${report.reportId}:${report.reportSize} bits`).join(', ')||'none'}. ${error.message}`);}}
  async readInit(kind){if(!this.connected)throw Error('Connect the keyboard first.');const d=this.handle;return new Promise(async(resolve,reject)=>{let total=null;const parts=new Map(),seen=[],request=Buffer.alloc(20);request.set([8,0,kind]);let attempts=0;const finish=()=>{clearTimeout(timer);clearTimeout(retryTimer);d.removeEventListener('inputreport',on)};const timer=setTimeout(()=>{finish();const detail=seen.length?` Received ${seen.map(item=>`${item.length} bytes/report ${item.id}`).join(', ')}.`:' No input reports received.';reject(Error(`Device read timed out for INIT${kind} (${parts.size}/${total??'?'} packets).${detail}`))},6000);const retryTimer=setTimeout(async()=>{if(parts.size===0&&attempts<2){attempts++;try{await this.send(request);}catch(error){finish();reject(error);}}},700);const on=event=>{const id=event.reportId??0,bytes=Buffer.from(event.data.buffer,event.data.byteOffset,event.data.byteLength);if(seen.length<8&&!seen.some(item=>item.id===id&&item.length===bytes.length))seen.push({id,length:bytes.length});if(id!==this.reportId&&id!==4&&id!==0)return;const report=bytes.length===21&&bytes[0]===this.reportId?bytes.subarray(1):bytes;if(report.length<20)return;const p=report[1]===0xbf?report:Buffer.from(report.map((v,i)=>v^IN[i]));if(p[0]!==8||p[1]!==0||p[2]!==kind)return;const length=p.readUInt16LE(3),sequence=p.readUInt16LE(5);if(!length||sequence<1||sequence>length)return;total??=length;parts.set(sequence,p.subarray(8));if(parts.size===total){finish();resolve(Buffer.concat(Array.from({length:total},(_,i)=>parts.get(i+1))))}};d.addEventListener('inputreport',on);try{attempts++;await this.send(request)}catch(error){finish();reject(error)}})}
  openReportStream(){
    if(!this.connected)throw Error('Connect the keyboard first.');
    const handle=this.handle,queue=this.pendingDeviceFrames.splice(0),waiters=[];
    this.reportStreams++;
    const on=event=>{try{const bytes=Buffer.from(event.data.buffer,event.data.byteOffset,event.data.byteLength);const report=bytes.length===21&&bytes[0]===this.reportId?bytes.subarray(1):bytes;if(report.length<20)return;const payload=report[1]===0xbf?report:Buffer.from(report.map((value,index)=>value^IN[index]));const waiter=waiters.shift();if(waiter){clearTimeout(waiter.timer);waiter.resolve(payload);}else queue.push(payload);}catch{}};
    handle.addEventListener('inputreport',on);
    return {next:(timeoutMs=1000)=>{if(queue.length)return Promise.resolve(queue.shift());return new Promise(resolve=>{const waiter={resolve};waiter.timer=setTimeout(()=>{const index=waiters.indexOf(waiter);if(index>=0)waiters.splice(index,1);resolve(null);},timeoutMs);waiters.push(waiter);});},close:()=>{try{handle.removeEventListener('inputreport',on);}catch{}for(const waiter of waiters){clearTimeout(waiter.timer);waiter.resolve(null);}waiters.length=0;this.reportStreams=Math.max(0,this.reportStreams-1);}};
  }
}
class BrowserAdapter {
  constructor(){this.device=new BrowserDevice();this.layer=0;this.calibrationSession=this.loadCalibrationSession();this.calibrationLive=new Map();this.calibrationLiveUpdatedAt=null;this.calibrationTelemetryFrames=0;this.calibrationTelemetryRejected=0;this.calibrationTelemetryError=null;}
  startCalibrationTelemetry(){
    if(typeof this.device.startCalibrationTelemetry!=='function')return;
    const keys=layout.map(({id,row,col})=>({id,row,col}));
    this.device.startCalibrationTelemetry(payload=>{
      this.calibrationTelemetryFrames++;
      try{
        const decoded=telemetry.decodeCalibrationPayload(payload,keys);
        if(decoded?.entries?.length){telemetry.mergeCalibrationEntries(this.calibrationLive,decoded.entries);this.calibrationLiveUpdatedAt=new Date().toISOString();}
      }catch(error){this.calibrationTelemetryRejected++;this.calibrationTelemetryError=error.message;}
    });
  }
  stopCalibrationTelemetry(){this.device.stopCalibrationTelemetry?.();}
  async connect(){return this.device.connect();}
  async autoConnect(){return this.device.connect({request:false});}
  async disconnect(){return this.device.close();}
  async reconnect(options){return this.device.reconnect(options);}
  async readProfile(layer){this.layer=layer;const raw=await this.device.readInit(25+layer);if(raw.length!==984)throw Error('Incomplete HE profile');return {layer,keys:parseHeProfile(raw).keys.map(display),layout};}
  async writeDeviceConfig(config){if(config.length<14)throw Error('Incomplete device settings');const payload=Buffer.alloc(20);payload.set([8,2]);config.copy(payload,2,0,14);await this.device.send(payload);let lastError;for(let attempt=0;attempt<3;attempt++){try{const observed=await this.device.readInit(1);if(observed.length>=14&&observed.subarray(0,14).equals(config.subarray(0,14)))return;lastError=new Error('Device profile selection did not verify');}catch(error){lastError=error;}}throw lastError||new Error('Device profile selection did not verify');}
  async withHeLayer(layer,action){const original=Buffer.from((await this.device.readInit(1)).subarray(0,14));if(original.length<14)throw Error('Incomplete device settings');if(original[11]===layer)return action();const selected=Buffer.from(original);selected[11]=layer;await this.writeDeviceConfig(selected);try{return await action();}finally{await this.writeDeviceConfig(original);}}
  async prepareDeviceMemorySave(){const sections=new Map();for(const kind of [1,2,4,24,25,26,6,7,9,17])sections.set(kind,await this.device.readInit(kind));return sections;}
  async savePreparedDeviceMemory(sections,stream=null,{requireCrc=true}={}){const result=await deviceMemory.saveDeviceMemory(this.device,sections,{requireCrc,stream,timeoutMs:requireCrc?10000:1500,tolerant:!requireCrc});await new Promise(resolve=>setTimeout(resolve,requireCrc?500:120));return {...result,backup:'browser-session',persistence:result.confirmed===false?'Save command sent; SAVE_END not confirmed; power-cycle verification required':'SAVE_END confirmed; power-cycle verification still required'};}
  async persistentCall(name,args=[],{requireCrc=false}={}){
    const action=this[name];if(typeof action!=='function')throw Error(`${name} is not available`);
    const sections=new Map();for(const kind of [2,4,25,26])sections.set(kind,await this.device.readInit(kind));
    const stream=this.device.openReportStream();let applied=false;
    try{
      const result=await action.apply(this,args);applied=true;
      if(result&&typeof result==='object'&&result.persistence)return {result,persistence:result.persistence};
      if(requireCrc)for(const kind of [2,4,25,26])sections.set(kind,await this.device.readInit(kind));
      const persistence=await this.savePreparedDeviceMemory(sections,stream,{requireCrc});
      return {result,persistence};
    }catch(error){error.applied=applied;throw error;}
    finally{stream.close();}
  }
  async heWrite(request,all=false){const layer=request.layer??this.layer;return this.withHeLayer(layer,async()=>{const sections=await this.prepareDeviceMemorySave(),before=parseHeProfile(sections.get(25+layer)),selected=all?before.keys:before.keys.filter(key=>(request.ids||[request.id]).includes(`${key.row}:${key.col}`)),raw=Buffer.from(sections.get(25+layer)),stream=this.device.openReportStream();let persistence;try{for(const key of selected){const next={...key,...request,row:key.row,col:key.col,rtOn:Number(request.rtOn)},encoded={...next,...Object.fromEntries(fields.map(field=>[field,Math.round(next[field]*500)]))};await this.device.send(encodeHeWrite(encoded,layer));const offset=(key.row*14+key.col)*14;raw[offset]=Number(next.rtOn);fields.forEach((field,index)=>raw.writeUInt16LE(encoded[field],offset+2+index*2));}sections.set(25+layer,raw);persistence=await this.savePreparedDeviceMemory(sections,stream);}finally{stream.close();}const profile=await this.readProfile(layer);return {...profile,persistence};});}
  async saveSelected(request){const profile=await this.heWrite(request,false);return {...profile,key:profile.keys.find(k=>`${k.row}:${k.col}`===request.id),verified:true};}
  async applyAll(request){return this.heWrite(request,true);}
  async readProgramming(layer){const raw=await this.device.readInit(layer?4:2);const parsed=prog.parseProgrammingProfile(raw);return {layer,keys:parsed.keys.map(({record,...key})=>key)};}
  async programmingWrite(layer,id,encoder){const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw),source=parsed.keys.find(k=>`${k.row}:${k.col}`===id);if(!source)throw Error('Select a physical source key');return this.persistProgramming(layer,async()=>{await this.device.send(encoder(source,parsed));});}
  programmingKey(result,id){return result.keys.find(key=>`${key.row}:${key.col}`===id);}
  assertDksReadback(result,id,target,enabled){const key=this.programmingKey(result,id);if(!key)throw Error(`DKS readback missing for ${id}`);if(!enabled){if(key.mode!==0)throw Error(`DKS readback mismatch for ${id}: assignment mode is ${key.mode}`);return;}if(key.mode!==4)throw Error(`DKS readback mismatch for ${id}: assignment mode is ${key.mode}`);if(typeof target==='string'&&target.startsWith('mouse:')){if(key.dks.mouseAction!==target.slice(6))throw Error(`DKS readback mismatch for ${id}: mouse target is ${key.dks.mouseAction||'unknown'}`);}else{const physical=layout.find(item=>item.id===target),expectedRow=physical?.row+1,expectedCol=physical?.col;if(!physical||key.dks.type!==0||key.dks.row!==expectedRow||key.dks.col!==expectedCol)throw Error(`DKS readback mismatch for ${id}: target is ${key.dks.row}:${key.dks.col}`);}}
  async persistProgramming(layer,action){
    const kind=layer?4:2,sections=await this.prepareDeviceMemorySave();
    const stream=this.device.openReportStream();
    try{
      await new Promise(resolve=>setTimeout(resolve,150));
      await action();
      let raw=null,previous=null;
      for(let attempt=0;attempt<6;attempt++){
        await new Promise(resolve=>setTimeout(resolve,200));
        raw=await this.device.readInit(kind);
        if(previous&&raw.equals(previous))break;
        previous=Buffer.from(raw);
      }
      sections.set(kind,raw);
      const persistence=await this.savePreparedDeviceMemory(sections,stream),parsed=prog.parseProgrammingProfile(raw);
      return {layer,keys:parsed.keys.map(({record,...key})=>key),persistence};
    }finally{stream.close();}
  }
  async setPair({layer,mode,first,second}){if(![0,5,6].includes(mode))throw Error('Select Snap Tap, SOCD or Disabled');const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw),a=parsed.keys.find(k=>`${k.row}:${k.col}`===first),b=parsed.keys.find(k=>`${k.row}:${k.col}`===second);if(!a||!b||first===second)throw Error('Select two different physical keys');return this.persistProgramming(layer,async()=>{for(const [key,partner] of [[a,b],[b,a]])await this.device.send(mode===0?prog.encodeModRestore({...key,mode:0},layer,parsed.allSteps):prog.encodePair(key,layer,parsed.allSteps,mode,{row:partner.row+1,col:partner.col}));}).then(result=>{const keys=[[first,second],[second,first]].map(([id,partner])=>({key:this.programmingKey(result,id),partner}));if(keys.some(({key})=>!key||key.mode!==mode))throw Error('Pair change readback mismatch: assignment mode was not applied to both keys');if(mode!==0&&keys.some(({key,partner})=>{const target=this.programmingKey(parsed,partner);const field=mode===5?'snap':'cancel';return !target||key[field].row!==target.row+1||key[field].col!==target.col;}))throw Error('Pair change readback mismatch: partner target was not applied to both keys');return result;});}
  async setRemap({layer,source,target}){const logical=typeof target==='string'&&target.startsWith('key:')?target.split(':').slice(1).map(Number):null,to=logical?{row:logical[0],col:logical[1]}:layout.find(k=>k.id===target);if(!to)throw Error('Select a keyboard target');return this.programmingWrite(layer,source,(key,p)=>prog.encodeStandardRemap(key,layer,p.allSteps,to));}
  async setHotKey({layer,id,interval}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeHotKey(key,layer,p.allSteps,interval));}
  async setMedia({layer,id,index,data}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeMedia(key,layer,p.allSteps,index,data));}
  async setModify({layer,id,modify}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeModify(key,layer,p.allSteps,modify));}
  async setLayerAssignment({layer,id,targetLayer}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeLayer(key,layer,p.allSteps,targetLayer));}
  async resetProgrammingKey({layer,id}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeProgrammingReset(key,layer,p.allSteps));}
  async resetAllProgramming({layer}){
    if(![0,1].includes(layer))throw Error('Select M1 or M2');
    const kind=layer?4:2,raw=await this.device.readInit(kind),parsed=prog.parseProgrammingProfile(raw);
    try{globalThis.localStorage?.setItem('m6-programming-reset-backup',JSON.stringify({at:new Date().toISOString(),layer,raw:Array.from(raw)}));}catch{}
    const visible=parsed.keys.filter(key=>layout.some(physical=>physical.row===key.row&&physical.col===key.col));
    const isPhysical=key=>layout.some(physical=>physical.row===key.row&&physical.col===key.col);
    for(const key of visible){await this.device.send(prog.encodeProgrammingReset(key,layer,parsed.allSteps));await new Promise(resolve=>setTimeout(resolve,35));}
    await new Promise(resolve=>setTimeout(resolve,200));
    let result=await this.readProgramming(layer);
    const invalidKeys=()=>result.keys.filter(key=>isPhysical(key)&&(key.mode!==0||key.locked!==0));
    for(let attempt=0;attempt<3&&invalidKeys().length;attempt++){
      for(const key of invalidKeys()){await this.device.send(prog.encodeProgrammingReset(parsed.keys.find(item=>item.row===key.row&&item.col===key.col)||key,layer,parsed.allSteps));await new Promise(resolve=>setTimeout(resolve,35));}
      await new Promise(resolve=>setTimeout(resolve,250));
      result=await this.readProgramming(layer);
    }
    const invalid=invalidKeys();
    if(invalid.length){const labels=invalid.map(key=>`${key.row}:${key.col}`).join(', ');throw Error(`Programming reset readback mismatch: ${invalid.length} keys are not Standard (${labels}). Backup: browser-session`);}
    return {...result,verified:true,resetCount:visible.length,backup:'browser-session'};
  }
  async setKeyEnabled({layer,id,enabled}){return this.programmingWrite(layer,id,(key,p)=>prog.encodeKeyEnabled(key,layer,p.allSteps,enabled));}
  dksTarget(target){if(typeof target==='string'&&target.startsWith('mouse:'))return target.slice(6);const physical=layout.find(key=>key.id===target);if(!physical)throw Error('Select a physical DKS target or mouse action');return {row:physical.row+1,col:physical.col};}
  async setDks({layer,id,target,interval,enabled=true}){const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw),key=parsed.keys.find(k=>`${k.row}:${k.col}`===id);if(!key)throw Error('Select a physical source key');return this.persistProgramming(layer,async()=>{await this.device.send(enabled?prog.encodeDks(key,layer,parsed.allSteps,prog.buildDksRecord(key.record.subarray(52,64),this.dksTarget(target),interval)):prog.encodeModRestore({...key,mode:0},layer,parsed.allSteps));}).then(result=>{this.assertDksReadback(result,id,target,enabled);return result;});}
  async setDksAll({layer,target,interval}){const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw),dksTarget=this.dksTarget(target);return this.persistProgramming(layer,async()=>{for(const key of parsed.keys.filter(key=>layout.some(physical=>physical.row===key.row&&physical.col===key.col)))await this.device.send(prog.encodeDks(key,layer,parsed.allSteps,prog.buildDksRecord(key.record.subarray(52,64),dksTarget,interval)));});}
  async setDksWasd({layer,enabled=true}){const pairs=[['1:2','2:2'],['2:2','1:2'],['2:1','2:3'],['2:3','2:1']];let result;for(const [id,target] of pairs)result=await this.setDks({layer,id,target,interval:20,enabled});return result;}
  async returnToStandard({layer,id}){const raw=await this.device.readInit(layer?4:2),parsed=prog.parseProgrammingProfile(raw),key=parsed.keys.find(k=>`${k.row}:${k.col}`===id);if(!key)throw Error('Select a physical source key');await this.device.send(prog.encodeModRestore({...key,mode:0},layer,parsed.allSteps));return this.readProgramming(layer);}
  loadCalibrationSession(){try{const value=globalThis.localStorage?.getItem('m6-calibration-session');return value?JSON.parse(value):null;}catch{return null;}}
  saveCalibrationSession(session){this.calibrationSession=session;try{globalThis.localStorage?.setItem('m6-calibration-session',JSON.stringify(session));}catch{}}
  async readCalibration(){const raw=await this.device.readInit(24),records=calibration.parseCalibration(raw),visible=calibration.visibleCalibrationRecords(records,layout);let comparison=null;const session=this.calibrationSession;if(session?.baseline){const before=Buffer.from(session.baseline);comparison={...calibration.compareCalibration(before,raw,layout),phase:session.phase,baselineBackup:'browser-session',cancelVerified:session.phase==='canceled'?before.equals(raw):null,persistenceVerified:false};const selectedIds=session.selectedIds||(session.selectedId?[session.selectedId]:[]);if(selectedIds.length){const selectedChanges=comparison.changedKeys.filter(k=>selectedIds.includes(k.id)),unexpected=comparison.changedRecords.filter(k=>!selectedIds.includes(k.id)),single=selectedIds.length===1?selectedChanges[0]:null;comparison.selectedScope={ids:selectedIds,...(single?{id:single.id}:{}),selectedChanged:selectedChanges.length>0,otherRecordsUnchanged:unexpected.length===0,unexpectedRecords:unexpected.map(k=>({index:k.index,id:k.id,label:k.label})),verified:session.phase==='finished'&&selectedChanges.length>0&&unexpected.length===0&&selectedChanges.every(change=>change.rangeChanged&&!change.modelChanged&&!change.reservedChanged&&change.after.rangeStatus==='ok')};}}
    const liveActive=this.calibrationSession?.phase==='active';
    const liveEntries=liveActive?[...this.calibrationLive.values()]:[];
    const liveRecords=Object.fromEntries(liveEntries.map(entry=>[entry.id,{...entry}]));
    return {records,visible,layout,backup:'browser-session',comparison,readAt:new Date().toISOString(),liveProgressAvailable:liveActive&&liveEntries.length>0,live:{active:liveActive,available:liveActive&&liveEntries.length>0,count:liveEntries.length,updatedAt:liveActive?this.calibrationLiveUpdatedAt:null,frames:liveActive?this.calibrationTelemetryFrames:0,rejected:liveActive?this.calibrationTelemetryRejected:0,error:liveActive?this.calibrationTelemetryError:null,records:liveRecords},statusSummary:visible.reduce((s,k)=>(s[k.rangeStatus]=(s[k.rangeStatus]||0)+1,s),{})};}
  async calibrationCommand(command,selected){
    if(![1,2,3].includes(command))throw Error('Unsupported calibration command');
    if(command===1&&this.calibrationSession?.phase==='active')throw Error('Calibration is already active');
    if(command!==1)this.stopCalibrationTelemetry();
    const selectedIds=Array.isArray(selected)?selected.filter(Boolean):(selected?[selected]:[]);
    let baseline=this.calibrationSession?.baseline;
    if(command===1){baseline=Array.from(await this.device.readInit(24));calibration.parseCalibration(Buffer.from(baseline));}
    if(command===1){this.calibrationLive.clear();this.calibrationLiveUpdatedAt=null;this.calibrationTelemetryFrames=0;this.calibrationTelemetryRejected=0;this.calibrationTelemetryError=null;}
    const p=Buffer.alloc(20);p.set([8,48,command]);await this.device.send(p);
    const phase=command===1?'active':command===2?'finished':'canceled';
    this.saveCalibrationSession({phase,baseline,selectedIds:selectedIds.length?selectedIds:(this.calibrationSession?.selectedIds||null),selectedId:selectedIds[0]||this.calibrationSession?.selectedId||null,updatedAt:new Date().toISOString()});
    if(command===1)this.startCalibrationTelemetry();
    return {command,started:command===1,finished:command===2,canceled:command===3,backup:'browser-session'};
  }
  async calibrateSelected(id){if(!layout.some(key=>key.id===id))throw Error('Select one physical switch');return this.calibrationCommand(1,id);}
  async calibrateSelectedKeys(ids){if(!Array.isArray(ids)||!ids.length||ids.some(id=>!layout.some(key=>key.id===id)))throw Error('Select one or more physical switches');return this.calibrationCommand(1,ids);}
  async calibrationState(){const s=this.calibrationSession;return {active:s?.phase==='active',phase:s?.phase||'idle',baselineBackup:s?.baseline?'browser-session':null,source:'browser-session',deviceStateVerified:false,...(s?.selectedId?{selectedId:s.selectedId}:{}),...(s?.selectedIds?{selectedIds:s.selectedIds}:{})};}
  async resetCalibration(){
    const before=await this.device.readInit(24);calibration.parseCalibration(before);
    try{globalThis.localStorage?.setItem('m6-calibration-reset-backup',JSON.stringify({at:new Date().toISOString(),raw:Array.from(before)}));}catch{}
    const payload=Buffer.alloc(20);payload.set([8,48,4]);await this.device.send(payload);
    let after;try{after=await this.device.readInit(24);}catch(error){throw Error(`Calibration reset command was sent, but readback failed: ${error.message}. Backup: browser-session`);}
    const records=calibration.parseCalibration(after),invalid=records.filter(record=>record.min!==2000||record.max!==2200);
    if(invalid.length)throw Error(`Calibration reset readback mismatch: ${invalid.length} records are not at 2000 / 2200. Backup: browser-session`);
    return {command:4,verified:true,backup:'browser-session',records,layout,resetCount:records.length};
  }
  deviceSettingsFromRaw(raw,light){
    if(!Buffer.isBuffer(raw)||raw.length<14)throw Error('Incomplete device settings');
    if(light!==undefined&&(!Buffer.isBuffer(light)||light.length<5))throw Error('Incomplete lighting settings');
    const isFlag=value=>value===0||value===1;
    const performanceMode=raw[3],fpsEnhance=raw[12],saturation=light?[light[0],light[1],light[2]]:null;
    return {raw:Array.from(raw),performanceMode,fpsEnhance,autoCalibration:raw[13],windowsLock:raw[5],fnAltSwap:raw[10],canEditFps:isFlag(fpsEnhance),canEditAutoCalibration:isFlag(raw[13]),canEditPerformance:[0,1,2].includes(performanceMode),performanceName:['BeastMode','EyeMode','DevMode'][performanceMode]||'Unknown mode',autoLightOff:raw[8],autoLightOffMinutes:raw[9],canEditAutoLightOff:isFlag(raw[8]),...(light?{highlight:light[4],canEditHighlight:isFlag(light[4]),saturation,canEditSaturation:saturation.every(value=>Number.isInteger(value)&&value>=64&&value<=255)}:{})};
  }
  async readDeviceSettings(){const raw=await this.device.readInit(1),light=await this.device.readInit(17);return this.deviceSettingsFromRaw(raw,light);}
  async settingsFromRaw(raw,light){return this.deviceSettingsFromRaw(raw,light);}
  async applyDeviceSetting(patch,{kind=1,includeLight=false,guard,reconnectExpected=false,verify=true}={}){
    const beforeRaw=await this.device.readInit(1),beforeLight=await this.device.readInit(17);
    const settings=this.deviceSettingsFromRaw(beforeRaw,beforeLight);
    if(guard&&!guard(settings))throw Error('Unsupported device setting value');
    const source=kind===1?beforeRaw:beforeLight;
    if(kind===1&&source.length<14)throw Error('Incomplete device settings');
    if(kind===17&&source.length<18)throw Error('Incomplete lighting settings');
    const expected=Buffer.from(source);for(const [field,value] of Object.entries(patch))expected[field]=value;
    if(expected.equals(source))return {...settings,verified:true,changed:false};
    const dispatch=async target=>{const payload=Buffer.alloc(20);payload.set([8,kind===1?2:17]);target.copy(payload,2,0,kind===1?14:18);await this.device.send(payload);};
    await dispatch(expected);
    const resultFrom=(raw,light)=>this.deviceSettingsFromRaw(raw,light);
    if(!verify)return {...resultFrom(kind===1?expected:beforeRaw,kind===17?expected:beforeLight),verified:false,changed:true,verificationSkipped:true};
    if(reconnectExpected)return {...resultFrom(kind===1?expected:beforeRaw,kind===17?expected:beforeLight),verified:true,changed:true,reconnectPending:true};
    let lastError;
    for(let attempt=0;attempt<8;attempt++){
      await new Promise(resolve=>setTimeout(resolve,300));
      try{
        const actual=await this.device.readInit(kind);
        if(actual.length===expected.length&&actual.subarray(0,expected.length).equals(expected))return {...resultFrom(kind===1?actual:beforeRaw,kind===17?actual:beforeLight),verified:true,changed:true};
        lastError=Error('Device settings readback mismatch');
      }catch(error){lastError=error;}
    }
    try{await dispatch(source);}catch{}
    throw lastError||Error('Device settings readback mismatch');
  }
  async setFpsEnhance(enabled){if(typeof enabled!=='boolean')throw Error('FPS Enhance must be enabled or disabled');return this.applyDeviceSetting({12:enabled?1:0},{guard:s=>s.canEditFps});}
  async setPerformanceMode(mode){if(![0,1,2].includes(mode))throw Error('Select BeastMode, EyeMode or DevMode');const result=await this.applyDeviceSetting({3:mode},{reconnectExpected:true,guard:s=>s.canEditPerformance});if(!result.changed)return result;return {...result,reconnectPending:true};}
  async setAutoCalibration(enabled,options={}){if(typeof enabled!=='boolean')throw Error('Auto calibration must be enabled or disabled');return this.applyDeviceSetting({13:Number(enabled)},{includeLight:true,guard:s=>s.canEditAutoCalibration,verify:options?.verify!==false});}
  async setAutoLightOff(request){if(!request||typeof request.enabled!=='boolean')throw Error('Auto light off must be enabled or disabled');if((request.enabled||request.minutes!==undefined)&&!(Number.isInteger(request.minutes)&&request.minutes>=1&&request.minutes<=30))throw Error('Auto light off delay must be an integer from 1 to 30 minutes');const patch={8:Number(request.enabled)};if(request.minutes!==undefined)patch[9]=request.minutes;return this.applyDeviceSetting(patch,{includeLight:true,guard:s=>s.canEditAutoLightOff});}
  async setHighlight(enabled){if(typeof enabled!=='boolean')throw Error('Highlight must be enabled or disabled');return this.applyDeviceSetting({4:Number(enabled)},{kind:17,includeLight:true,guard:s=>s.canEditHighlight});}
  async setSaturation(rgb){if(!Array.isArray(rgb)||rgb.length!==3||!rgb.every(value=>Number.isInteger(value)&&value>=64&&value<=255))throw Error('Saturation requires three integers from 64 to 255');return this.applyDeviceSetting({0:rgb[0],1:rgb[1],2:rgb[2]},{kind:17,includeLight:true,guard:s=>s.canEditSaturation});}
  async saveToDeviceMemory({requireCrc=false}={}){const sections=await this.prepareDeviceMemorySave();return this.savePreparedDeviceMemory(sections,null,{requireCrc});}
  async quickPreset(request){return this.setQuickPreset(request);}
  async presetOff(request){return this.setQuickPreset({...request,preset:'off'});}
  verifyQuickPreset(result,layer,preset){
    const pairs=new Map([['1:2','2:2'],['2:2','1:2'],['2:1','2:3'],['2:3','2:1']]);
    const ids=['snap','cl'].includes(preset)?['2:1','2:3']:preset==='dks'?[...pairs.keys()]:[...pairs.keys()];
    for(const id of ids){
      const key=this.programmingKey(result,id),target=pairs.get(id);
      if(!key)throw Error(`Quick ${preset} readback missing for ${id}`);
      if(preset==='off'){if(key.mode!==0||key.locked!==0||key.modify.type!==0||key.modify.row!==key.row+1||key.modify.col!==key.col)throw Error(`Quick preset Off readback mismatch for ${id}`);}
      else if(preset==='dks')this.assertDksReadback(result,id,target,true);
      else if(preset==='cl'){if(key.mode!==6)throw Error(`Quick CL readback mismatch for ${id}: assignment mode is ${key.mode}`);}
      else if(key.mode!==5||key.snap.row!==Number(target.split(':')[0])+1||key.snap.col!==Number(target.split(':')[1]))throw Error(`Quick SNAP readback mismatch for ${id}`);
    }
  }
  async setQuickPreset({layer,preset}){
    const kind=layer?4:2,raw=await this.device.readInit(kind),plan=presets.prepareQuickPreset(raw,layer,preset);
    if(!plan.changed)return {verified:true,layer,changed:false,keys:prog.parseProgrammingProfile(raw).keys.map(({record,...key})=>key)};
    const commands=[...(plan.commands||[plan.command])];
    if(commands.length>1)commands.push(commands[0]);
    const result=await this.persistProgramming(layer,async()=>{
      for(const command of commands){
        await this.device.send(command);
        await new Promise(resolve=>setTimeout(resolve,250));
      }
    });
    try{this.verifyQuickPreset(result,layer,preset);}
    catch(error){
      for(const command of plan.restore||[]){try{await this.device.send(command);}catch{}}
      throw Error(`${error.message}; restoration was attempted.`);
    }
    return {...result,verified:true,changed:true,backup:'browser-session'};
  }
  async exportHe(layer){if(![0,1].includes(layer))throw Error('Select M1 or M2');return heFile.exportProfile(await this.readProfile(layer),layer);}
  async importHe(layer,document){if(![0,1].includes(layer))throw Error('Select M1 or M2');const incoming=heFile.validateProfile(document);return this.withHeLayer(layer,async()=>{const raw=await this.device.readInit(25+layer),before=parseHeProfile(raw),fields=['rtOn','head','trigger','release','fixedDown','fixedUp','bottom'];let changed=0;for(const key of incoming){const old=before.keys[key.row*14+key.col];if(fields.some(field=>old[field]!==key[field])){await this.device.send(encodeHeWrite(key,layer));changed++;}}const after=await this.device.readInit(25+layer);const observed=parseHeProfile(after);for(const key of incoming){const got=observed.keys[key.row*14+key.col];if(fields.some(field=>got[field]!==key[field]))throw Error('HE profile readback mismatch');}return {layer,keys:observed.keys.map(display),layout,changed,verified:true};});}
  async readBrightness(){const raw=await this.device.readInit(17);return {brightness:raw[3]};}
  async setBrightness(value){const raw=await this.device.readInit(17);if(!Number.isInteger(value)||value<0||value>255)throw Error('Brightness must be an integer from 0 to 255');raw[3]=value;await this.device.send(configPayload(raw));return this.readBrightness();}
  async readBackLight(){const state=backState(await this.device.readInit(6)),config=await this.device.readInit(17);return {...state,enabled:config[5]===1,canEditEnabled:[0,1].includes(config[5])};}
  async setBackLightMode(mode){const raw=await this.device.readInit(6);if(![2,3,4,5,6,7].includes(mode))throw Error('Unsupported Back Light mode');raw[0]=mode;await this.device.send(backPayload(raw,mode));return this.readBackLight();}
  async setBackLightEnabled(value){const raw=await this.device.readInit(17);raw[5]=value?1:0;await this.device.send(configPayload(raw));return this.readBackLight();}
  async setBackLightColor(request){const raw=await this.device.readInit(6),mode=request.mode??raw[0],offset=8+(mode-2)*10;if(![2,3,5,6,7].includes(mode)||!/^#[0-9a-f]{6}$/i.test(request.color))throw Error('Expected a supported mode and #RRGGBB');if(mode!==raw[0])throw Error('Active Back Light effect changed. Refresh before applying settings.');Buffer.from(request.color.slice(1),'hex').copy(raw,offset+3);if(mode!==6)raw[offset+2]=request.customRgb?1:0;await this.device.send(backPayload(raw,mode));return this.readBackLight();}
  async setBackLightSpeed(request){const raw=await this.device.readInit(6),mode=request.mode??raw[0],offset=8+(mode-2)*10,range=backSpeed[mode];if(!range||mode!==raw[0]||!Number.isInteger(request.speed)||request.speed<range[0]||request.speed>range[1])throw Error('Invalid Back Light speed');raw.writeUInt16LE(request.speed,offset+6);const payload=backPayload(raw,mode);for(let attempt=0;attempt<3;attempt++){await this.device.send(payload);if(attempt<2)await new Promise(resolve=>setTimeout(resolve,25));}return this.readBackLight();}
  async setBackLightDirection(request){const raw=await this.device.readInit(6),mode=request.mode??raw[0],offset=8+(mode-2)*10;if(![5,7].includes(mode)||mode!==raw[0]||typeof request.reverse!=='boolean')throw Error('Direction editing is available for Stream and Roll only');raw[offset]=request.reverse?1:0;await this.device.send(backPayload(raw,mode));return this.readBackLight();}
  async readUnderLight(){const state=underState(await this.device.readInit(9)),config=await this.device.readInit(17);return {...state,enabled:config[9]===1,sync:config[11],brightness:config[10],canEditEnabled:[0,1].includes(config[9]),canEditSync:[0,1].includes(config[11])};}
  async setUnderLightMode(mode){const raw=await this.device.readInit(9),m=underModes[mode];if(!m)throw Error('Unsupported Under Light mode');raw[0]=mode;await this.device.send(underPayload(raw,mode));return this.readUnderLight();}
  async setUnderLightBrightness(value){const raw=await this.device.readInit(17);if(!Number.isInteger(value)||value<0||value>255)throw Error('Brightness must be an integer from 0 to 255');raw[10]=value;await this.device.send(configPayload(raw));return this.readUnderLight();}
  async setUnderLightEnabled(value){const raw=await this.device.readInit(17);raw[9]=value?1:0;await this.device.send(configPayload(raw));return this.readUnderLight();}
  async setUnderLightSync(value){const raw=await this.device.readInit(17);raw[11]=value?1:0;await this.device.send(configPayload(raw));return this.readUnderLight();}
  async setUnderLightColor(request){const raw=await this.device.readInit(9),mode=request.mode??raw[0],m=underModes[mode];if(!m||![3,7].includes(mode)||mode!==raw[0]||!/^#[0-9a-f]{6}$/i.test(request.color))throw Error('Under Light custom color is available for active Normal or Breath only');if(mode===3)raw[m.offset]=request.customRgb?1:0;Buffer.from(request.color.slice(1),'hex').copy(raw,m.offset+1);await this.device.send(underPayload(raw,mode));return this.readUnderLight();}
  async setUnderLightSpeed(request){const raw=await this.device.readInit(9),mode=request.mode??raw[0],m=underModes[mode],range={3:[1500,3000],4:[5000,20000],5:[2000,6000],6:[2000,4000]}[mode];if(!m||!range||mode!==raw[0]||!Number.isInteger(request.speed)||request.speed<range[0]||request.speed>range[1])throw Error('Invalid Under Light speed');raw.writeUInt16LE(request.speed,m.offset+4);const payload=underPayload(raw,mode);for(let attempt=0;attempt<3;attempt++){await this.device.send(payload);if(attempt<2)await new Promise(resolve=>setTimeout(resolve,25));}return this.readUnderLight();}
  async readSingleLight(){const raw=await this.device.readInit(7),config=await this.device.readInit(17);return {enabled:config[6]===1,canEnable:[0,1].includes(config[6]),keys:layout.map(k=>{const o=(k.col*6+k.row)*10;return {id:k.id,label:k.label,enabled:raw[o]===1,mode:raw[o+1],brightness:raw[o+2],color:'#'+raw.subarray(o+3,o+6).toString('hex').toUpperCase(),canEdit:[0,1].includes(raw[o])&&raw[o+1]===1};})};}
 async setSingleLight(request){
  const raw=await this.device.readInit(7);
  if(Object.hasOwn(request,'mode'))throw Error('Single Light supports RGB and brightness editing only');
  if(Object.hasOwn(request,'active')){
   if(typeof request.active!=='boolean')throw Error('active must be a boolean');
   const cfg=await this.device.readInit(17);
   if(![0,1].includes(cfg[6]))throw Error('Unknown Single Light enable state');
   cfg[6]=request.active?1:0;
   await this.device.send(configPayload(cfg));
   return this.readSingleLight();
  }
  if(!Array.isArray(request.keys)||!request.keys.length||new Set(request.keys).size!==request.keys.length)throw Error('Select unique keys');
  if(!['enabled','color','brightness'].some(field=>Object.hasOwn(request,field)))throw Error('Expected RGB, brightness or key enable state');
  if(Object.hasOwn(request,'enabled')&&typeof request.enabled!=='boolean')throw Error('enabled must be a boolean');
  if(Object.hasOwn(request,'color')&&(typeof request.color!=='string'||!/^#[0-9a-f]{6}$/i.test(request.color)))throw Error('Expected #RRGGBB color');
  if(Object.hasOwn(request,'brightness')&&(!Number.isInteger(request.brightness)||request.brightness<0||request.brightness>255))throw Error('Brightness must be an integer from 0 to 255');
  // Assigning a color activates the key and the Single Light layer, otherwise the stored RGB would never be
  // displayed (the vendor firmware only lights records whose actived byte is 1). An explicit enabled flag wins.
  const activates=Object.hasOwn(request,'enabled')?request.enabled===true:Object.hasOwn(request,'color');
  const cfg=await this.device.readInit(17);
  if(![0,1].includes(cfg[6]))throw Error('Unknown Single Light enable state');
  if(activates)cfg[6]=1;
  // The keyboard only redraws the Single Light overlay once it receives a light
  // configuration packet (INIT17). Verified on hardware 2026-10-30: per-key SINGLE
  // records persist either way, but they stay invisible until INIT17 follows them,
  // so the configuration is re-sent around the key records even when it is unchanged.
  await this.device.send(configPayload(cfg));
  for(const id of request.keys){
   const key=layout.find(k=>k.id===id);if(!key)throw Error('Unknown key');
   const o=(key.col*6+key.row)*10;
   if((raw[o]!==0&&raw[o]!==1)||raw[o+1]!==1)throw Error('Only Normal Single Light records can currently be edited safely');
   const p=Buffer.alloc(20);p.set([8,8,1,key.col,key.row]);raw.copy(p,5,o,o+6);
   if(Object.hasOwn(request,'enabled'))p[5]=request.enabled?1:0;else if(Object.hasOwn(request,'color'))p[5]=1;
   if(Object.hasOwn(request,'brightness'))p[7]=request.brightness;
   if(Object.hasOwn(request,'color'))Buffer.from(request.color.slice(1),'hex').copy(p,8);
   await this.device.send(p);
  }
  await this.device.send(configPayload(cfg));
  return this.readSingleLight();
 }
}
module.exports={BrowserAdapter,BrowserDevice,layout};
