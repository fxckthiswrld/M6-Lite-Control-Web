'use strict';
// Browser transport: all device calls stay in the page and use WebHID.
const adapterReady=import('./browser-backend.js?v=20261021-50').then(m=>new (m.BrowserAdapter||m.default.BrowserAdapter)());
const unsupported=name=>({ok:false,error:`${name} is not available in this browser build yet.`});
const persistentMethods=new Set(['saveSelected','applyAll','importHe','setPair','setRemap','setHotKey','setMedia','setModify','setLayerAssignment','resetProgrammingKey','resetAllProgramming','setKeyEnabled','setDks','setDksAll','setDksWasd','presetOff','quickPreset','returnToStandard','setBackLightMode','setBackLightEnabled','setBackLightColor','setBackLightSpeed','setBackLightDirection','setBrightness','setUnderLightMode','setUnderLightEnabled','setUnderLightSync','setUnderLightBrightness','setUnderLightColor','setUnderLightSpeed','setSingleLight']);
const crcSaveMethods=new Set(['importHe','returnToStandard']);
const selfPersistingMethods=new Set(['saveSelected','applyAll','setPair','setRemap','setHotKey','setMedia','setModify','setLayerAssignment','resetProgrammingKey','resetAllProgramming','setKeyEnabled','setDks','setDksAll','setDksWasd','presetOff','quickPreset']);
const mergePersistence=(result,persistence)=>result&&typeof result==='object'&&!Array.isArray(result)?{...result,persistence}:result;
async function invoke(name,args=[]){
 let applied=false;
 try{
  const adapter=await adapterReady;
  if(typeof adapter[name]!=='function')return unsupported(name);
  if(persistentMethods.has(name)&&!selfPersistingMethods.has(name)&&typeof adapter.persistentCall==='function'){
   const {result,persistence}=await adapter.persistentCall(name,args,{requireCrc:crcSaveMethods.has(name)});
   applied=true;
   return {ok:true,result:mergePersistence(result,persistence)};
  }
  const result=await adapter[name](...args);
  applied=true;
  if(result&&typeof result==='object'&&result.persistence)return {ok:true,result};
  if(!persistentMethods.has(name))return {ok:true,result};
  const persistence=await adapter.saveToDeviceMemory({requireCrc:crcSaveMethods.has(name)});
  return {ok:true,result:mergePersistence(result,persistence)};
 }catch(error){applied=applied||!!error?.applied;return {ok:false,error:applied?`${name} was applied but could not be saved to device memory: ${error.message}`:error.message};}
}
async function exportHe(layer){const reply=await invoke('exportHe',[layer]);if(!reply.ok)return reply;const blob=new Blob([JSON.stringify(reply.result,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`M6-Lite-HE-M${layer+1}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),0);return {ok:true,result:{exported:true,document:reply.result}};}
async function importHe(layer){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';return new Promise(resolve=>{input.onchange=async()=>{const file=input.files?.[0];if(!file)return resolve({ok:true,result:{canceled:true}});if(file.size>128*1024)return resolve({ok:false,error:'HE profile file is too large'});try{const document=JSON.parse((await file.text()).replace(/^\uFEFF/,''));resolve(await invoke('importHe',[layer,document]));}catch(error){resolve({ok:false,error:error.message});}};input.click();});}
const methods=['connect','autoConnect','disconnect','reconnect','readProfile','readProgramming','saveSelected','applyAll','saveToDeviceMemory','setPair','setRemap','setHotKey','setMedia','setModify','setLayerAssignment','resetProgrammingKey','resetAllProgramming','setKeyEnabled','setDks','setDksAll','setDksWasd','presetOff','quickPreset','readBackLight','setBackLightMode','setBackLightEnabled','setBackLightColor','setBackLightSpeed','setBackLightDirection','readBrightness','setBrightness','readUnderLight','setUnderLightMode','setUnderLightEnabled','setUnderLightSync','setUnderLightBrightness','setUnderLightColor','setUnderLightSpeed','readSingleLight','setSingleLight','calibrationState','readCalibration','calibrationCommand','calibrateSelected','calibrateSelectedKeys','resetCalibration','readDeviceSettings','setFpsEnhance','setPerformanceMode','setAutoCalibration','setAutoLightOff','setHighlight','setSaturation','returnToStandard'];
const keyboard={mediaActions:[
  {
    "id": "VOL_MUTE",
    "label": "Mute",
    "index": 1,
    "data": 1
  },
  {
    "id": "SAVE",
    "label": "Save",
    "index": 255,
    "data": 5
  },
  {
    "id": "CALC",
    "label": "Calculator",
    "index": 1,
    "data": 16
  },
  {
    "id": "WWW_FORWARD",
    "label": "Browser forward",
    "index": 2,
    "data": 8
  },
  {
    "id": "REDO",
    "label": "Redo",
    "index": 255,
    "data": 6
  },
  {
    "id": "VOL_UP",
    "label": "Volume up",
    "index": 1,
    "data": 2
  },
  {
    "id": "COMPUTER",
    "label": "This PC",
    "index": 1,
    "data": 8
  },
  {
    "id": "NULL",
    "label": "No action",
    "index": 1,
    "data": 0
  },
  {
    "id": "PASTE",
    "label": "Paste",
    "index": 255,
    "data": 2
  },
  {
    "id": "PLAY_PREVIOUS",
    "label": "Previous track",
    "index": 1,
    "data": 64
  },
  {
    "id": "WWW_BACK",
    "label": "Browser back",
    "index": 2,
    "data": 4
  },
  {
    "id": "VOL_DOWN",
    "label": "Volume down",
    "index": 1,
    "data": 4
  },
  {
    "id": "COPY",
    "label": "Copy",
    "index": 255,
    "data": 1
  },
  {
    "id": "PLAY",
    "label": "Play / pause",
    "index": 1,
    "data": 32
  },
  {
    "id": "MAIN_PAGE",
    "label": "Browser home",
    "index": 2,
    "data": 2
  },
  {
    "id": "CANCEL",
    "label": "Cancel (vendor action)",
    "index": 255,
    "data": 3
  },
  {
    "id": "PLAY_NEXT",
    "label": "Next track",
    "index": 1,
    "data": 128
  },
  {
    "id": "CUT",
    "label": "Cut",
    "index": 255,
    "data": 4
  }
]
,getFeatures:async()=>fetch('features.json').then(r=>r.json()).then(result=>({ok:true,result})),readProfile:layer=>invoke('readProfile',[layer]),readProgramming:layer=>invoke('readProgramming',[layer]),exportHe,importHe};
for(const name of methods)if(!(name in keyboard))keyboard[name]=(...args)=>invoke(name,args);
window.keyboard=keyboard;
if(navigator.hid?.addEventListener){
 const publish=(phase,device)=>{
  if(device?.vendorId!==0x2233||device?.productId!==0x006b)return;
  window.dispatchEvent(new CustomEvent('m6-device-status',{detail:{phase,vendorId:device.vendorId,productId:device.productId,productName:device.productName||'M6 Lite+'}}));
 };
 navigator.hid.addEventListener('connect',event=>publish('connected',event.device));
 navigator.hid.addEventListener('disconnect',event=>publish('disconnected',event.device));
}

