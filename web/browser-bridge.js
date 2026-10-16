'use strict';
// Browser transport: all device calls stay in the page and use WebHID.
const adapterReady=import('./browser-backend.js').then(m=>new (m.BrowserAdapter||m.default.BrowserAdapter)());
const unsupported=name=>({ok:false,error:`${name} is not available in this browser build yet.`});
async function invoke(name,args=[]){try{const adapter=await adapterReady;if(typeof adapter[name]!=='function')return unsupported(name);return {ok:true,result:await adapter[name](...args)};}catch(error){return {ok:false,error:error.message};}}
const methods=['connect','readProfile','readProgramming','saveSelected','applyAll','saveToDeviceMemory','setPair','setRemap','setHotKey','setMedia','setModify','setLayerAssignment','resetProgrammingKey','setKeyEnabled','setDks','setDksAll','setDksWasd','presetOff','quickPreset','readBackLight','setBackLightMode','setBackLightEnabled','setBackLightColor','setBackLightSpeed','setBackLightDirection','readBrightness','setBrightness','readUnderLight','setUnderLightMode','setUnderLightEnabled','setUnderLightSync','setUnderLightBrightness','setUnderLightColor','setUnderLightSpeed','readSingleLight','setSingleLight','calibrationState','readCalibration','calibrationCommand','calibrateSelected','readDeviceSettings','setFpsEnhance','setPerformanceMode','exportHe','importHe','returnToStandard','getState','hardwareStatus','hardwareReadStatus'];
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
,getFeatures:async()=>fetch('features.json').then(r=>r.json()).then(result=>({ok:true,result})),readProfile:layer=>invoke('readProfile',[layer]),readProgramming:layer=>invoke('readProgramming',[layer])};
for(const name of methods)if(!(name in keyboard))keyboard[name]=(...args)=>invoke(name,args);
window.keyboard=keyboard;
fetch('keyboard-layout.json').then(r=>r.json()).then(()=>{const button=document.createElement('button');button.id='browser-connect';button.className='secondary';button.textContent='Connect keyboard';document.querySelector('.header-actions')?.prepend(button);button.onclick=async()=>{button.disabled=true;const reply=await window.keyboard.connect();button.disabled=false;const status=document.querySelector('.online');if(reply.ok){if(status)status.textContent='Connected - browser HID';window.m6UI?.refresh?.();}else if(status)status.textContent=reply.error;};});
