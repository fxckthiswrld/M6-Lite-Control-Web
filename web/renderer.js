'use strict';
const $ = id => document.getElementById(id);
function updateLightingSlider(id,valueId){const input=$(id),output=$(valueId);if(input&&output){const percent=id.includes('brightness')||id==='underlight-speed';output.value=percent?`${input.value}%`:input.value;}}
function speedToPercent(value,min,max){if(!Number.isFinite(value)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return '';return Math.round((value-min)*100/(max-min));}
function percentToSpeed(percent,min,max){if(!Number.isFinite(percent)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return min;return Math.round(min+(percent/100)*(max-min));}
const travelFields = ['head','bottom','trigger','release','fixedDown','fixedUp'];
let layer = 0, selectedId = '2:1', profile = null, busy = false;
let programming=null;
let selectedIds=new Set(['2:1']),multipleSelection=false;
const hePanel=document.querySelector('.panel');
const advancedPanel=document.createElement('section');advancedPanel.className='panel advanced-panel';advancedPanel.hidden=true;
advancedPanel.innerHTML='<small>PROGRAMMING</small><h2>Snap Tap / SOCD</h2><p>Choose any two switches and configure their assignment in the current profile. Quick presets above use fixed WASD or A/D keys.</p><div class="controls"><label>First switch<select id="pair-first"></select></label><label>Second switch<select id="pair-second"></select></label><label>Mode<select id="pair-mode"><option value="5">Snap Tap</option><option value="6">SOCD / AD Cancel</option></select></label></div><p id="pair-current"></p><div class="actions"><button id="pair-apply">Apply pair</button><button id="pair-disable" class="secondary">Disable pair</button><span id="pair-status" role="status" aria-live="polite"></span></div>';
advancedPanel.insertAdjacentHTML('beforeend','<hr><h2>DKS</h2><p>Configure a keyboard or mouse action and interval for one switch.</p><div class="controls"><label>Source switch<select id="dks-source"></select></label><label>Target action<select id="dks-target"></select></label><label>Interval<input id="dks-interval" type="number" min="10" max="100" step="1" value="20"></label></div><div class="actions"><button id="dks-apply">Apply DKS</button><button id="dks-disable" class="secondary">Disable DKS</button><span id="dks-status" role="status"></span></div>');
const presetPanel=document.createElement('section');presetPanel.className='panel preset-panel';
const dksAllButton=document.createElement('button');dksAllButton.id='dks-preview-all';dksAllButton.className='secondary';dksAllButton.textContent='Preview all switches';
advancedPanel.querySelector('#dks-disable').after(dksAllButton);
const dksAllDialog=document.createElement('dialog');
dksAllDialog.innerHTML='<h2>Apply DKS to all switches</h2><p id="dks-all-summary"></p><p>This replaces Standard and DKS assignments across the selected profile. Other advanced assignments must be disabled first.</p><div class="actions"><button id="dks-all-confirm">Apply to all</button><button id="dks-all-cancel" class="secondary">Cancel</button></div>';
document.body.appendChild(dksAllDialog);
let dksAllDraft=null;
$('dks-all-cancel').onclick=()=>dksAllDialog.close();
dksAllDialog.addEventListener('close',()=>{dksAllDraft=null;});
dksAllButton.onclick=()=>{
  if(busy||!programming||!profile||!$('dks-interval').reportValidity()||!$('dks-target').value)return;
  dksAllDraft={layer,target:$('dks-target').value,interval:$('dks-interval').valueAsNumber};
  const conflicts=profile.layout.filter(k=>![0,4].includes(programming.keys[k.row*14+k.col].mode));
  $('dks-all-summary').textContent=`M${layer+1}: ${profile.layout.length} switches → ${$('dks-target').selectedOptions[0].textContent}; interval ${dksAllDraft.interval}. ${conflicts.length?`${conflicts.length} switches have conflicting assignments.`:'All switches use Standard or DKS mode.'}`;
  $('dks-all-confirm').disabled=conflicts.length>0;dksAllDialog.showModal();
};
$('dks-all-confirm').onclick=async()=>{
  const request=dksAllDraft;
  if(!request||busy||request.layer!==layer)return;
  dksAllDialog.close();setBusy(true);$('dks-status').textContent='Applying DKS to all switches and verifying...';
  try{
    const reply=await window.keyboard.setDksAll(request);if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();$('dks-status').textContent='DKS applied to all switches. Device readback verified.';
  }catch(error){$('dks-status').textContent=error.message;}finally{setBusy(false);}
};
document.querySelector('header').after(presetPanel);
presetPanel.insertAdjacentHTML('afterbegin','<small>QUICK PRESETS</small><h2>DKS / SNAP</h2><p id="preset-preview"></p><div class="actions"><button id="dks-wasd">DKS - WASD</button><button id="dks-wasd-disable" class="secondary">Disable WASD DKS</button><button id="snap-ad">SNAP - A / D</button><button id="snap-ad-disable" class="secondary">Disable A / D SNAP</button><button id="preset-off" disabled title="Disable quick presets in the current profile">Off</button></div><p id="preset-status" role="status" aria-live="polite"></p><hr>');
advancedPanel.insertAdjacentHTML('beforeend','<hr><h2>HotKey</h2><p>Repeat one standard key at a controlled interval. The source must be in Standard mode.</p><div class="controls"><label>Source switch<select id="hotkey-source"></select></label><label>Interval<input id="hotkey-interval" type="number" min="0" max="255" step="1" value="20"></label></div><p id="hotkey-current"></p><div class="actions"><button id="hotkey-apply">Apply HotKey</button><span id="hotkey-status" role="status" aria-live="polite"></span></div>');
hePanel.after(advancedPanel);
const pendingPanel=document.createElement('section');pendingPanel.className='panel';pendingPanel.hidden=true;
pendingPanel.innerHTML='<small>IN DEVELOPMENT</small><h2 id="pending-title"></h2><p>This section is in development. Device controls will appear here when ready.</p>';
advancedPanel.after(pendingPanel);
const lightingPanel=document.createElement('section');lightingPanel.className='panel lighting-panel';lightingPanel.hidden=true;
lightingPanel.innerHTML='<small>LIGHTING</small><h2>Lighting control</h2><div class="lighting-section lighting-global"><h3>Back Light brightness</h3><label class="range-control"><input id="lighting-brightness" type="range" min="0" max="100" step="1" disabled><output id="lighting-brightness-value">—</output></label><div class="actions"><button id="lighting-read">Refresh</button><button id="lighting-apply" disabled>Apply</button></div><p id="lighting-status" role="status" aria-live="polite">Read Back Light brightness from the keyboard.</p></div>';
pendingPanel.after(lightingPanel);
lightingPanel.insertAdjacentHTML('afterbegin','<div class="lighting-service-controls" hidden aria-hidden="true"><input id="backlight-enabled" type="checkbox" disabled><button id="backlight-enabled-apply" disabled>Apply Back Light power</button></div>');
lightingPanel.insertAdjacentHTML('beforeend','<hr><h3>Back Light effect</h3><p id="lighting-mode-current">Read the current effect from the keyboard.</p><div class="controls"><label>Effect<select id="lighting-mode" disabled><option value="2">Normal</option><option value="5">Stream</option><option value="4">Gradient</option><option value="6">Star</option><option value="7">Roll</option><option value="3">Breath</option></select></label></div><button id="lighting-mode-apply" disabled>Apply effect</button><p id="lighting-mode-status" role="status">Normal lighting effects are available while the application runs.</p>');
lightingPanel.insertAdjacentHTML('beforeend','<div id="lighting-color-controls"><h3>Current effect color</h3><div class="controls"><label class="toggle-row"><input id="lighting-custom-rgb" type="checkbox" disabled><span>Custom RGB</span></label><label class="color-field">Color<input id="lighting-color" type="color" disabled></label></div><button id="lighting-color-apply" disabled>Apply color</button><p id="lighting-color-note">Apply an effect before editing its color. Single Light can override this color on assigned keys.</p></div>');
lightingPanel.insertAdjacentHTML('beforeend','<div class="lighting-section"><h3>Effect speed</h3><label class="range-control"><input id="lighting-speed" type="range" min="0" max="6000" step="1" disabled><output id="lighting-speed-value">—</output></label><button id="lighting-speed-apply" disabled>Apply speed</button><p id="lighting-speed-note">Apply an effect to edit its speed. Normal has no speed control.</p></div>');
lightingPanel.insertAdjacentHTML('beforeend','<div class="direction-control"><h3>Effect direction</h3><label class="toggle-row"><input id="lighting-reverse" type="checkbox" disabled><span>Reverse</span></label><button id="lighting-direction-apply" disabled>Apply direction</button></div>');
lightingPanel.insertAdjacentHTML('beforeend','<hr><h2>Under Light</h2><p>Independent lighting beneath the keyboard.</p><p id="underlight-current">Read the current effect from the keyboard.</p><div class="controls"><label>Effect<select id="underlight-mode" disabled><option value="5">Stream</option><option value="3">Breath</option><option value="6">Star</option><option value="4">Gradient</option><option value="7">Normal</option></select></label></div><div class="actions"><button id="underlight-read">Refresh Under Light</button><button id="underlight-apply" disabled>Apply Under Light</button></div><p id="underlight-status" role="status">Refresh to read Normal Sync status.</p>');
lightingPanel.insertAdjacentHTML('beforeend','<h3>Under Light color</h3><div class="controls"><label class="toggle-row"><input id="underlight-custom-rgb" type="checkbox" disabled><span>Custom RGB</span></label><label class="color-field">Color<input id="underlight-color" type="color" disabled></label></div><button id="underlight-color-apply" disabled>Apply Under Light color</button><p>Color is available for Normal and Breath. Apply the effect before editing its color.</p>');
lightingPanel.insertAdjacentHTML('beforeend','<div class="lighting-section"><h3>Under Light speed</h3><label class="range-control"><input id="underlight-speed" type="range" min="0" max="6000" step="1" disabled><output id="underlight-speed-value">—</output></label><button id="underlight-speed-apply" disabled>Apply Under Light speed</button><p id="underlight-speed-note">Apply an effect before editing its speed.</p></div>');
lightingPanel.insertAdjacentHTML('beforeend','<div class="lighting-section"><h3>Under Light brightness</h3><label class="range-control"><input id="underlight-brightness" type="range" min="0" max="100" step="1" disabled><output id="underlight-brightness-value">—</output></label><button id="underlight-brightness-apply" disabled>Apply Under Light brightness</button></div>');
lightingPanel.insertAdjacentHTML('beforeend','<h3>Under Light power</h3><label><input id="underlight-enabled" type="checkbox" disabled> Enable Under Light</label><button id="underlight-enabled-apply" disabled>Apply Under Light power</button>');
lightingPanel.insertAdjacentHTML('beforeend','<h3>Under Light synchronization</h3><label><input id="underlight-sync" type="checkbox" disabled> Normal Sync</label><button id="underlight-sync-apply" disabled>Apply Normal Sync</button><p id="underlight-sync-note">Disable Normal Sync to edit independent Under Light effects.</p>');
lightingPanel.insertAdjacentHTML('beforeend','<hr><h2>Single Light</h2><label><input id="single-active" type="checkbox" disabled> Enable Single Light layer</label><button id="single-active-apply" disabled>Apply layer</button><div class="controls"><label>Keys (Ctrl or Shift for a group)<select id="single-keys" multiple size="8" disabled></select></label><label><input id="single-enabled" type="checkbox" disabled> Override Back Light for selected keys</label><label>Color<input id="single-color" type="color" disabled></label></div><button id="single-read">Refresh Single Light</button><button id="single-apply" disabled>Apply to selected keys</button><p id="single-status" role="status">Read Single Light from the keyboard.</p><p>Colors override Back Light only for enabled keys while this layer is enabled. Use Save to device memory to store applied settings.</p>');
let singleState=null,singleReady=false;
function showSingleSelection(){
 const ids=Array.from($('single-keys').selectedOptions,o=>o.value),keys=singleState?.keys.filter(k=>ids.includes(k.id))||[];
 if(keys.length){$('single-color').value=keys[0].color;$('single-enabled').checked=keys[0].enabled;}
 $('single-status').textContent=keys.length?`${keys.length} key(s) selected. ${keys.some(k=>k.color!==keys[0].color||k.enabled!==keys[0].enabled)?'Mixed values; applying replaces values for this group.':'Saved values shown.'}`:'Select one or more keys.';
 updateLightingControls();
}
async function readSingleLight(){
 singleReady=false;const reply=await window.keyboard.readSingleLight();if(!reply.ok)throw Error(reply.error);
 singleState=reply.result;singleReady=true;$('single-active').checked=singleState.enabled;
 const ids=new Set(Array.from($('single-keys').selectedOptions,o=>o.value));$('single-keys').replaceChildren();
 for(const k of singleState.keys){const option=document.createElement('option');option.value=k.id;option.textContent=`${k.label}: ${k.enabled?k.color:'Back Light'}${k.canEdit?'':' (unsupported mode)'}`;option.selected=ids.size?ids.has(k.id):selectedIds.has(k.id);$('single-keys').appendChild(option);}
 showSingleSelection();
}
async function singleAction(kind){
 if(busy||(kind!=='read'&&!singleReady))return;
 const request=kind==='layer'?{active:$('single-active').checked}:{keys:Array.from($('single-keys').selectedOptions,o=>o.value),enabled:$('single-enabled').checked,color:$('single-color').value};
 setBusy(true);
 try{if(kind!=='read'){const reply=await window.keyboard.setSingleLight(request);if(!reply.ok)throw Error(reply.error);}await readSingleLight();if(kind!=='read')$('single-status').textContent='Single Light applied; device readback verified. Use Save to device memory to store it.';}
 catch(error){singleReady=false;$('single-status').textContent=error.message;}finally{setBusy(false);}
}
$('single-keys').onchange=showSingleSelection;$('single-read').onclick=()=>singleAction('read');$('single-apply').onclick=()=>singleAction('keys');$('single-active-apply').onclick=()=>singleAction('layer');
let lightingBrightnessReady=false,lightingModeReady=false,lightingState=null,lightingSavedBrightness=null,underLightState=null,underLightReady=false;
function discardLightingDraft(){
 $('backlight-enabled').checked=!!lightingState?.enabled;
 if(singleState){$('single-active').checked=singleState.enabled;showSingleSelection();}
 if(lightingSavedBrightness!==null)$('lighting-brightness').value=lightingSavedBrightness;
 if(lightingState){$('lighting-mode').value=lightingState.canSwitch?String(lightingState.mode):'';$('lighting-custom-rgb').checked=!!lightingState.customRgb;$('lighting-color').value=lightingState.color||'#000000';}
 $('lighting-speed').value=lightingState?.speed??'';
 $('lighting-reverse').checked=!!lightingState?.reverse;
 if(underLightState)$('underlight-mode').value=underLightState.canSwitch?String(underLightState.mode):'';
 $('underlight-custom-rgb').checked=!!underLightState?.customRgb;$('underlight-color').value=underLightState?.color||'#000000';
 $('underlight-speed').min=0;$('underlight-speed').max=100;$('underlight-speed').value=underLightState?speedToPercent(underLightState.speed,underLightState.speedMinimum,underLightState.speedMaximum):'';
 $('underlight-brightness').value=underLightState?.brightness??'';
 $('underlight-enabled').checked=!!underLightState?.enabled;
 $('underlight-sync').checked=underLightState?.sync===1;
 updateLightingControls();
}
function updateLightingControls(){
 const backPowerReady=lightingModeReady&&lightingState?.canEditEnabled;
 $('backlight-enabled').disabled=busy||!backPowerReady;$('backlight-enabled-apply').disabled=busy||!backPowerReady;
 const singleIds=Array.from($('single-keys').selectedOptions,o=>o.value),editable=singleReady&&singleIds.length>0&&singleIds.every(id=>singleState.keys.find(k=>k.id===id)?.canEdit);
 $('single-keys').disabled=busy||!singleReady;
 for(const id of ['single-apply','single-enabled','single-color'])$(id).disabled=busy||!editable;
 for(const id of ['single-active','single-active-apply'])$(id).disabled=busy||!singleReady||!singleState?.canEnable;
 const syncReady=underLightReady&&underLightState?.canEditSync;
 $('underlight-sync').disabled=busy||!syncReady;$('underlight-sync-apply').disabled=busy||!syncReady;
 const independentReady=underLightReady&&underLightState?.sync===0;
 const powerReady=underLightReady&&underLightState?.canEditEnabled;
 $('underlight-enabled').disabled=busy||!powerReady;$('underlight-enabled-apply').disabled=busy||!powerReady;
 $('underlight-brightness').disabled=busy||!underLightReady;$('underlight-brightness-apply').disabled=busy||!underLightReady;
 $('lighting-brightness').disabled=busy||!lightingBrightnessReady;$('lighting-apply').disabled=busy||!lightingBrightnessReady;
 $('lighting-mode').disabled=busy||!lightingModeReady;$('lighting-mode-apply').disabled=busy||!lightingModeReady;
 const colorReady=lightingModeReady&&lightingState?.canEditColor&&Number($('lighting-mode').value)===lightingState.mode;
 $('lighting-custom-rgb').disabled=busy||!colorReady||!lightingState?.supportsCustomRgb;$('lighting-color-apply').disabled=busy||!colorReady;
 $('lighting-custom-rgb').closest('label').hidden=lightingState?.mode===6;
 $('lighting-color').disabled=busy||!colorReady||(lightingState?.supportsCustomRgb&&!$('lighting-custom-rgb').checked);
 const speedReady=lightingModeReady&&lightingState?.canEditSpeed&&Number($('lighting-mode').value)===lightingState.mode;
 $('lighting-speed').closest('.lighting-section')?.classList.toggle('no-speed',!speedReady);
 $('lighting-speed').disabled=busy||!speedReady;$('lighting-speed-apply').disabled=busy||!speedReady;
 const directionReady=lightingModeReady&&lightingState?.canEditDirection&&Number($('lighting-mode').value)===lightingState.mode;
 $('lighting-reverse').disabled=busy||!directionReady;$('lighting-direction-apply').disabled=busy||!directionReady;
 $('underlight-mode').disabled=busy||!independentReady;$('underlight-apply').disabled=busy||!independentReady;
 const underColorReady=independentReady&&underLightState?.canEditColor&&Number($('underlight-mode').value)===underLightState.mode;
 $('underlight-custom-rgb').disabled=busy||!underColorReady||!underLightState?.supportsCustomRgb;$('underlight-color-apply').disabled=busy||!underColorReady;
 $('underlight-custom-rgb').closest('label').hidden=underLightState?.mode===7;
 $('underlight-color').disabled=busy||!underColorReady||(underLightState?.supportsCustomRgb&&!$('underlight-custom-rgb').checked);
 const underSpeedReady=independentReady&&underLightState?.canEditSpeed&&Number($('underlight-mode').value)===underLightState.mode;
 const underSpeedBlock=$('underlight-speed')?.closest('.lighting-section');if(underSpeedBlock)underSpeedBlock.classList.toggle('no-speed',!underSpeedReady);
 $('underlight-speed').disabled=busy||!underSpeedReady;$('underlight-speed-apply').disabled=busy||!underSpeedReady;
}
$('backlight-enabled-apply').onclick=async()=>{
 if(busy||!lightingModeReady||!lightingState?.canEditEnabled)return;
 const enabled=$('backlight-enabled').checked;setBusy(true);
 try{const reply=await window.keyboard.setBackLightEnabled(enabled);if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent='Back Light power applied; device readback verified. Use Save to device memory to store it.';}
 catch(error){lightingModeReady=false;$('lighting-mode-status').textContent=error.message;}finally{setBusy(false);}
};
$('underlight-sync-apply').onclick=async()=>{
 if(busy||!underLightReady||!underLightState?.canEditSync)return;
 const sync=$('underlight-sync').checked;setBusy(true);
 try{const reply=await window.keyboard.setUnderLightSync(sync);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent='Normal Sync applied; device readback verified. Use Save to device memory to store it.';}
 catch(error){underLightReady=false;$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('underlight-enabled-apply').onclick=async()=>{
 if(busy||!underLightReady||!underLightState?.canEditEnabled)return;
 const enabled=$('underlight-enabled').checked;setBusy(true);
 try{const reply=await window.keyboard.setUnderLightEnabled(enabled);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent='Under Light power applied; device readback verified. Use Save to device memory to store it.';}
 catch(error){underLightReady=false;$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('underlight-brightness-apply').onclick=async()=>{
 if(busy||!underLightReady)return;
 const value=Math.round($('underlight-brightness').valueAsNumber*255/100);
 if(!Number.isInteger(value)||value<0||value>255){$('underlight-status').textContent='Enter a whole number from 0 to 255.';return;}
 setBusy(true);
 try{const reply=await window.keyboard.setUnderLightBrightness(value);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent='Under Light brightness applied; device readback verified. Use Save to device memory to store it.';}
 catch(error){underLightReady=false;$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('underlight-speed-apply').onclick=async()=>{
 if(busy||!underLightReady||!underLightState?.canEditSpeed||Number($('underlight-mode').value)!==underLightState.mode)return;
 const percent=$('underlight-speed').valueAsNumber,{speedMinimum:min,speedMaximum:max}=underLightState;
 if(!Number.isInteger(percent)||percent<0||percent>100){$('underlight-status').textContent='Choose a speed from 0 to 100%.';return;}
 const speed=percentToSpeed(percent,min,max);
 const request={mode:underLightState.mode,speed};setBusy(true);$('underlight-status').textContent='Applying Under Light speed and verifying device settings...';
 try{const reply=await window.keyboard.setUnderLightSpeed(request);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent='Under Light speed applied; configuration readback verified. Use Save to device memory to store it.';}
 catch(error){underLightReady=false;$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('underlight-mode').onchange=updateLightingControls;$('underlight-custom-rgb').onchange=updateLightingControls;
$('underlight-color-apply').onclick=async()=>{
 if(busy||!underLightReady||!underLightState?.canEditColor||Number($('underlight-mode').value)!==underLightState.mode)return;
 const request={mode:underLightState.mode,customRgb:underLightState.supportsCustomRgb?$('underlight-custom-rgb').checked:false,color:$('underlight-color').value};setBusy(true);
 $('underlight-status').textContent='Applying Under Light color and verifying device settings...';
 try{const reply=await window.keyboard.setUnderLightColor(request);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent='Under Light color applied; configuration readback verified. Use Save to device memory to store it.';}
 catch(error){underLightReady=false;$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
async function readUnderLight(){
 underLightReady=false;const reply=await window.keyboard.readUnderLight();if(!reply.ok)throw Error(reply.error);
 underLightState=reply.result;underLightReady=underLightState.canSwitch;
 $('underlight-brightness').value=Math.round(underLightState.brightness*100/255);updateLightingSlider('underlight-brightness','underlight-brightness-value');
 $('underlight-enabled').checked=underLightState.enabled;
 $('underlight-sync').checked=underLightState.sync===1;
 $('underlight-sync-note').textContent=underLightState.sync===0?'Normal Sync is off. Independent effects are available.':'Disable Normal Sync to edit independent Under Light effects.';
 $('underlight-current').textContent=`Current effect: ${underLightState.name}`;
 $('underlight-mode').value=underLightReady?String(underLightState.mode):'';
 $('underlight-custom-rgb').checked=!!underLightState.customRgb;$('underlight-color').value=underLightState.color||'#000000';
 $('underlight-speed').min=0;$('underlight-speed').max=100;$('underlight-speed').value=underLightState.canEditSpeed?speedToPercent(underLightState.speed,underLightState.speedMinimum,underLightState.speedMaximum):'';updateLightingSlider('underlight-speed','underlight-speed-value');
 $('underlight-speed-note').textContent=underLightState.canEditSpeed?'0 to 100% of the effect speed range.':'This effect has no speed control.';
 $('underlight-speed').closest('.lighting-section')?.classList.toggle('no-speed',!underLightState.canEditSpeed);
 $('underlight-status').textContent=underLightReady?'Effect read from keyboard. Refresh to read Normal Sync status.':'This saved Under Light effect is not supported yet.';
}
async function underLightAction(apply=false){
 if(busy||(apply&&!underLightReady))return;
 const mode=Number($('underlight-mode').value);setBusy(true);
 try{if(apply){const reply=await window.keyboard.setUnderLightMode(mode);if(!reply.ok)throw Error(reply.error);}await readUnderLight();if(apply)$('underlight-status').textContent='Under Light applied; configuration readback verified. Use Save to device memory to store it.';}
 catch(error){underLightReady=false;$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
}
$('underlight-read').onclick=()=>underLightAction();$('underlight-apply').onclick=()=>underLightAction(true);
$('lighting-direction-apply').onclick=async()=>{
 if(busy||!lightingModeReady||!lightingState?.canEditDirection||Number($('lighting-mode').value)!==lightingState.mode)return;
 const request={mode:lightingState.mode,reverse:$('lighting-reverse').checked};setBusy(true);
 $('lighting-mode-status').textContent='Applying direction and verifying device settings...';
 try{const reply=await window.keyboard.setBackLightDirection(request);if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent='Direction applied; configuration readback verified. Use Save to device memory to store it.';}
 catch(error){lightingModeReady=false;$('lighting-mode-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('lighting-speed-apply').onclick=async()=>{
 if(busy||!lightingModeReady||!lightingState?.canEditSpeed||Number($('lighting-mode').value)!==lightingState.mode)return;
 const speed=$('lighting-speed').valueAsNumber;
 const {speedMinimum:min,speedMaximum:max}=lightingState;
 if(!Number.isInteger(speed)||speed<min||speed>max){$('lighting-mode-status').textContent=`Enter a whole number from ${min} to ${max}.`;return;}
 setBusy(true);$('lighting-mode-status').textContent='Applying speed and verifying device settings...';
 try{const reply=await window.keyboard.setBackLightSpeed({mode:lightingState.mode,speed});if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent='Speed applied; configuration readback verified. Use Save to device memory to store it.';}
 catch(error){lightingModeReady=false;$('lighting-mode-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('lighting-mode').onchange=updateLightingControls;$('lighting-custom-rgb').onchange=updateLightingControls;
$('lighting-color-apply').onclick=async()=>{
 if(busy||!lightingModeReady||!lightingState?.canEditColor||Number($('lighting-mode').value)!==lightingState.mode)return;
 const request={mode:lightingState.mode,customRgb:lightingState.supportsCustomRgb?$('lighting-custom-rgb').checked:false,color:$('lighting-color').value};setBusy(true);
 $('lighting-mode-status').textContent='Applying color and verifying device settings...';
 try{const reply=await window.keyboard.setBackLightColor(request);if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent='Color applied; configuration readback verified. Use Save to device memory to store it.';}
 catch(error){lightingModeReady=false;$('lighting-mode-status').textContent=error.message;}
 finally{setBusy(false);}
};
async function readLightingMode(){
 lightingModeReady=false;
 const reply=await window.keyboard.readBackLight();if(!reply.ok)throw Error(reply.error);
 const state=reply.result;lightingState=state;$('backlight-enabled').checked=state.enabled;$('lighting-mode-current').textContent=`Current effect: ${state.name}`;
 $('lighting-speed').value=state.speed??'';updateLightingSlider('lighting-speed','lighting-speed-value');
 $('lighting-reverse').checked=!!state.reverse;
 $('lighting-speed').min=state.speedMinimum??0;$('lighting-speed').max=state.speedMaximum??0;updateLightingSlider('lighting-speed','lighting-speed-value');
 $('lighting-speed-note').textContent=state.canEditSpeed?`${state.name} speed: ${state.speedMinimum} to ${state.speedMaximum}, matching MMPanel.`:'This effect has no speed control.';
 $('lighting-speed').closest('.lighting-section')?.classList.toggle('no-speed',!state.canEditSpeed);
 $('lighting-custom-rgb').checked=!!state.customRgb;$('lighting-color').value=state.color||'#000000';
 $('lighting-color-note').textContent=state.mode===6?'Star uses the selected color directly. Single Light can override Back Light on assigned keys.':state.canEditColor?'Custom RGB overrides the effect palette. Apply an effect before editing its color. Single Light can override Back Light on assigned keys.':'This effect has no custom color control.';
 lightingModeReady=state.canSwitch;$('lighting-mode').value=state.canSwitch?String(state.mode):'';
 $('lighting-mode-status').textContent=state.canSwitch?'Normal, Stream, Gradient, Star, Roll and Breath are available.':'Switching from this effect is in development; select a supported Back Light effect in MMPanel first.';
}
$('lighting-mode-apply').onclick=async()=>{
 if(busy||!lightingModeReady)return;
 const mode=Number($('lighting-mode').value);setBusy(true);
 $('lighting-mode-status').textContent='Applying effect and verifying device settings...';
 try{const reply=await window.keyboard.setBackLightMode(mode);if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent='Effect applied; configuration readback verified. Use Save to device memory to store it.';}
 catch(error){lightingModeReady=true;$('lighting-mode-status').textContent=error.message;}
 finally{setBusy(false);}
};
async function lightingBrightness(apply=false){
 if(busy)return;
 const percent=$('lighting-brightness').valueAsNumber;
 const value=Math.round(percent*255/100);
 if(apply&&(!Number.isInteger(percent)||percent<0||percent>100)){$('lighting-status').textContent='Choose a brightness from 0 to 100%.';return;}
 setBusy(true);$('lighting-apply').disabled=true;$('lighting-read').disabled=true;$('lighting-brightness').disabled=true;
 let success=false;
 try{const reply=apply?await window.keyboard.setBrightness(value):await window.keyboard.readBrightness();if(!reply.ok)throw Error(reply.error);lightingSavedBrightness=reply.result.brightness;$('lighting-brightness').value=Math.round(lightingSavedBrightness*100/255);updateLightingSlider('lighting-brightness','lighting-brightness-value');success=true;$('lighting-status').textContent=apply?'Brightness applied; device readback verified.':'Brightness read from keyboard.';try{await readLightingMode();}catch(error){$('lighting-mode-status').textContent=error.message;}try{await readUnderLight();}catch(error){$('underlight-status').textContent=error.message;}try{await readSingleLight();}catch(error){$('single-status').textContent=error.message;}}
 catch(error){$('lighting-status').textContent=error.message;}
 finally{lightingBrightnessReady=success;setBusy(false);$('lighting-read').disabled=false;}
}
$('lighting-read').onclick=()=>lightingBrightness();$('lighting-apply').onclick=()=>lightingBrightness(true);
['lighting-brightness','lighting-speed','underlight-speed','underlight-brightness'].forEach(id=>$(id)?.addEventListener('input',()=>updateLightingSlider(id,`${id}-value`)));
const remapPanel=document.createElement('section');remapPanel.className='panel';remapPanel.hidden=true;
remapPanel.innerHTML='<small>PROGRAMMING</small><h2>Remap</h2><p>Assign one physical switch to another standard keyboard action. The source must be in Standard mode.</p><div class="controls"><label>Source switch<select id="remap-source"></select></label><label>Target action<select id="remap-target"></select></label></div><p id="remap-current"></p><div class="actions"><button id="remap-apply">Apply remap</button><span id="remap-status" role="status"></span></div><hr><h2>Layer assignment</h2><p>Assign FN1, FN2 or FN3, as in MMPanel.</p><div class="controls"><label>Source switch<select id="layer-source"></select></label><label>Target layer<select id="layer-target"><option value="0">FN1</option><option value="1">FN2</option><option value="2">FN3</option></select></label></div><p id="layer-current"></p><div class="actions"><button id="layer-apply">Apply FN</button><button id="layer-standard" disabled>Return to standard</button><span id="layer-standard-note"></span><span id="layer-status" role="status" aria-live="polite"></span></div><hr><h2>Media</h2><p>Choose or change a media or editing action.</p><div class="controls"><label>Source switch<select id="media-source"></select></label><label>Action<select id="media-action"></select></label></div><p id="media-current"></p><div class="actions"><button id="media-apply">Apply Media</button><button id="media-standard" disabled>Return to standard</button><span id="media-standard-note"></span><span id="media-status" role="status" aria-live="polite"></span></div>';
pendingPanel.after(remapPanel);
remapPanel.insertAdjacentHTML('beforeend','<hr><h2>Modify</h2><p>Configure keyboard or mouse modifier fields for one standard switch.</p><div class="controls"><label>Source switch<select id="modify-source"></select></label><label>Type<select id="modify-type"><option value="0">Keyboard</option><option value="1">Mouse</option></select></label><label>Target key<select id="modify-target"></select></label><label>Button<input id="modify-button" type="number" min="0" max="255" value="0"></label><label>X<input id="modify-x" type="number" min="-32768" max="32767" value="0"></label><label>Y<input id="modify-y" type="number" min="-32768" max="32767" value="0"></label><label>Wheel<input id="modify-wheel" type="number" min="-128" max="127" value="0"></label><label>Mode<input id="modify-mode" type="number" min="0" max="255" value="0"></label><label>Interval<input id="modify-interval" type="number" min="0" max="65535" value="0"></label></div><p id="modify-current"></p><div class="actions"><button id="modify-apply">Apply Modify</button><span id="modify-status" role="status" aria-live="polite"></span></div>');
function fillHotKey(){if(!programming||!profile)return;const select=$('hotkey-source'),previous=select.value||selectedId;select.replaceChildren();for(const key of profile.layout){const option=document.createElement('option');option.value=key.id;option.textContent=`${key.label||'Space'} (${key.row+1}:${key.col+1})`;select.appendChild(option);}select.value=previous;updateHotKey();}
function updateHotKey(){if(!programming)return;const [row,col]=$('hotkey-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);if(!key)return;$('hotkey-interval').value=key.hotKey?.interval??0;$('hotkey-current').textContent=`Current mode: ${key.mode===0?'Standard':`Mode ${key.mode}`}. HotKey type: ${key.hotKey?.type??0}, interval: ${key.hotKey?.interval??0}.`;$('hotkey-apply').disabled=busy||key.mode!==0;}
$('hotkey-source').onchange=updateHotKey;$('hotkey-apply').onclick=async()=>{if(busy||!programming)return;setBusy(true);$('hotkey-status').textContent='Applying and verifying HotKey...';try{const reply=await window.keyboard.setHotKey({layer,id:$('hotkey-source').value,interval:$('hotkey-interval').valueAsNumber});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillHotKey();$('hotkey-status').textContent='HotKey applied and verified by readback.';}catch(e){$('hotkey-status').textContent=e.message;}finally{setBusy(false);updateHotKey();}};
function fillRemap(){if(!profile)return;const opts=profile.layout.map(k=>`<option value="${k.id}">${k.label||k.id}</option>`).join('');$('remap-source').innerHTML=opts;$('remap-target').innerHTML=opts;$('remap-source').value=selectedId;updateRemapState();}
remapPanel.insertAdjacentHTML('beforeend','<hr><h2>Off / Enable key</h2><p>Off disables the source switch selected above. Available for Standard, Media, FN, DKS, Snap Tap and SOCD assignments. The saved assignment is retained.</p><label><input id="key-enabled" type="checkbox"> Enable selected key</label><button id="key-enabled-apply">Apply key state</button><p id="key-enabled-status" role="status"></p>');
$('key-enabled-apply').onclick=async()=>{
 if(busy||!programming)return;
 const request={layer,id:$('remap-source').value,enabled:$('key-enabled').checked};
 setBusy(true);$('key-enabled-apply').disabled=true;
 try{const reply=await window.keyboard.setKeyEnabled(request);if(!reply.ok)throw new Error(reply.error);programming=reply.result;showPairState();showDksState();$('key-enabled-status').textContent=(request.enabled?'Key enabled.':'Key disabled.')+' Configuration readback verified. Use Save to device memory to store it.';}
 catch(e){$('key-enabled-status').textContent=e.message;}
 finally{setBusy(false);updateRemapState();}
};
function updateRemapState(){if(!programming)return;const [row,col]=$('remap-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);$('key-enabled').checked=key?.locked===0;$('key-enabled').disabled=busy||!key||![0,2,3,4,5,6].includes(key.mode);$('key-enabled-apply').disabled=busy||!key||![0,2,3,4,5,6].includes(key.mode);$('remap-current').textContent=key?`Current mode: ${key.mode===0?'Standard':key.mode===2?'Media':key.mode===3?'FN/layer':key.mode===4?'DKS':key.mode===5?'Snap Tap':key.mode===6?'SOCD / AD Cancel':'Unsupported mode '+key.mode}.`:'Read programming profile first.';$('remap-apply').disabled=busy||!key||key.mode!==0||$('remap-target').value===$('remap-source').value;}
 $('remap-source').onchange=()=>{updateRemapState();updateModifyState();};$('remap-target').onchange=()=>{updateRemapState();updateModifyState();};$('remap-apply').onclick=async()=>{if(busy||!programming)return;const source=$('remap-source').value,target=$('remap-target').value;if(source===target)return;setBusy(true);$('remap-status').textContent='Applying and verifying remap...';try{const reply=await window.keyboard.setRemap({layer,source,target});if(!reply.ok)throw new Error(reply.error);programming=reply.result;updateRemapState();$('remap-status').textContent='Remap applied and verified by readback.';}catch(e){$('remap-status').textContent=e.message;}finally{setBusy(false);updateRemapState();}};
remapPanel.insertAdjacentHTML('beforeend','<div class="actions"><button id="programming-reset" class="secondary">Reset selected key to Standard</button><span id="programming-reset-status" role="status"></span></div>');
$('programming-reset').onclick=async()=>{if(busy||!programming)return;setBusy(true);$('programming-reset-status').textContent='Resetting and verifying...';try{const reply=await window.keyboard.resetProgrammingKey({layer,id:$('remap-source').value});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillRemap();fillLayer();fillMedia();fillModify();fillHotKey();showPairState();showDksState();const partners=(reply.result.remainingPairSources||[]).map(k=>profile.layout.find(p=>p.id===k.id)?.label||k.id);$('programming-reset-status').textContent='Selected key reset and verified.'+(partners.length?' Remaining Snap/SOCD assignments pointing to this key: '+partners.join(', ')+'. Use Disable pair to clear both assignments.':'');}catch(e){$('programming-reset-status').textContent=e.message;}finally{setBusy(false);updateRemapState();}};
function fillModify(){if(!profile||!programming)return;for(const id of ['modify-source','modify-target']){const select=$(id);select.replaceChildren();for(const key of profile.layout){const option=document.createElement('option');option.value=key.id;option.textContent=`${key.label||'Space'} (${key.row+1}:${key.col+1})`;select.appendChild(option);}select.value=selectedId;}updateModifyState();}
 function updateModifyState(){if(!programming)return;const [row,col]=$('modify-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);if(!key)return;const m=key.modify||{};const target=$('remap-target')?.value||`${m.row||0}:${m.col||0}`;$('modify-type').value=String(m.type||0);$('modify-target').value=target;$('modify-button').value=m.button||0;$('modify-x').value=m.x||0;$('modify-y').value=m.y||0;$('modify-wheel').value=m.wheel||0;$('modify-mode').value=m.mode||0;$('modify-interval').value=m.interval||0;$('modify-current').textContent=`Advanced action: ${m.type===1?'Mouse':'Keyboard'} · target ${target}.`;$('modify-apply').disabled=busy||key.mode!==0;}
$('modify-source').onchange=updateModifyState;
 $('modify-apply').onclick=async()=>{if(busy||!programming)return;const type=Number($('modify-type').value),target=$('remap-target').value.split(':').map(Number);const modify={type,row:target[0],col:target[1],button:Number($('modify-button').value),x:Number($('modify-x').value),y:Number($('modify-y').value),wheel:Number($('modify-wheel').value),mode:Number($('modify-mode').value),interval:Number($('modify-interval').value)};setBusy(true);$('modify-status').textContent='Applying advanced action...';try{const reply=await window.keyboard.setModify({layer,id:$('modify-source').value,modify});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillModify();$('modify-status').textContent='Advanced action applied and verified by readback.';}catch(e){$('modify-status').textContent=e.message;}finally{setBusy(false);updateModifyState();}};
function fillMedia(){if(!profile||!programming)return;const select=$('media-source'),previous=select.value||selectedId;select.replaceChildren();for(const key of profile.layout){const option=document.createElement('option');option.value=key.id;option.textContent=`${key.label||'Space'} (${key.row+1}:${key.col+1})`;select.appendChild(option);}select.value=previous;updateMediaState();}
function fillLayer(){if(!profile||!programming)return;const select=$('layer-source'),previous=select.value||selectedId;select.replaceChildren();for(const key of profile.layout){const option=document.createElement('option');option.value=key.id;option.textContent=`${key.label||'Space'} (${key.row+1}:${key.col+1})`;select.appendChild(option);}select.value=previous;updateLayerState();}
function standardReturnReason(key){
 if(!key)return 'Read the selected key first.';
 if(![2,3].includes(key.mode))return 'Available for Media and FN assignments.';
 const m=key.modify;
 if(!m||m.type!==0||m.row!==key.row+1||m.col!==key.col||m.mode!==0||m.interval!==0)return 'Return for this saved keyboard action is in development.';
 if((key.mode===2&&key.layer?.layer!==255)||(key.mode===3&&(key.media?.index!==1||key.media?.data!==0)))return 'Return with these saved assignments is in development.';
 return '';
}
function updateStandardReturn(name,key){
 const reason=standardReturnReason(key),button=$(name+'-standard');button.disabled=busy||!!reason;button.title=reason||'Restore the standard keyboard action.';
 $(name+'-standard-note').textContent=reason;
}
function updateLayerState(){if(!programming)return;const [row,col]=$('layer-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);if(!key)return;$('layer-current').textContent=`Current mode: ${key.mode===0?'Standard':key.mode===3?'Layer':'Mode '+key.mode}. Assigned layer: ${[0,1,2].includes(key.layer?.layer)?'FN'+(key.layer.layer+1):'None'}.`;$('layer-target').value=String([0,1,2].includes(key.layer?.layer)?key.layer.layer:0);$('layer-apply').disabled=busy||![0,3].includes(key.mode);updateStandardReturn('layer',key);}
$('layer-source').onchange=updateLayerState;$('layer-apply').onclick=async()=>{if(busy||!programming)return;setBusy(true);$('layer-status').textContent='Applying and verifying Layer assignment...';try{const reply=await window.keyboard.setLayerAssignment({layer,id:$('layer-source').value,targetLayer:Number($('layer-target').value)});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillLayer();$('layer-status').textContent='Layer assignment applied and verified by readback.';}catch(e){$('layer-status').textContent=e.message;}finally{setBusy(false);updateLayerState();}};
function updateMediaState(){
 if(!programming)return;
 const [row,col]=$('media-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);if(!key)return;
 const select=$('media-action');select.replaceChildren();
 for(const action of window.keyboard.mediaActions){const option=document.createElement('option');option.value=action.id;option.textContent=action.label;select.appendChild(option);}
 const current=window.keyboard.mediaActions.find(a=>a.index===key.media?.index&&a.data===key.media?.data);
 if(!current){const option=document.createElement('option');option.value='';option.textContent='Unknown saved action - choose a replacement';option.disabled=true;select.prepend(option);}
 select.value=current?.id??'';
 $('media-current').textContent=`Current mode: ${key.mode===0?'Standard':key.mode===2?'Media':`Mode ${key.mode}`}. Saved action: ${current?.label??'Unknown'}.`;
 $('media-apply').disabled=busy||![0,2].includes(key.mode)||!select.value;updateStandardReturn('media',key);
}
$('media-source').onchange=updateMediaState;
$('media-action').onchange=()=>{const [row,col]=$('media-source').value.split(':').map(Number);const key=programming?.keys.find(k=>k.row===row&&k.col===col);$('media-apply').disabled=busy||![0,2].includes(key?.mode)||!$('media-action').value;};
$('media-apply').onclick=async()=>{
 if(busy||!programming)return;
 const action=window.keyboard.mediaActions.find(a=>a.id===$('media-action').value);if(!action)return;
 setBusy(true);$('media-status').textContent='Applying and verifying Media...';
 try{const reply=await window.keyboard.setMedia({layer,id:$('media-source').value,index:action.index,data:action.data});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillMedia();$('media-status').textContent=`${action.label} applied and verified by readback.`;}
 catch(e){$('media-status').textContent=e.message;}finally{setBusy(false);updateMediaState();}
};
for(const name of ['media','layer'])$(name+'-standard').onclick=async()=>{
 if(busy||!programming)return;const [row,col]=$(name+'-source').value.split(':').map(Number);if(standardReturnReason(programming.keys.find(k=>k.row===row&&k.col===col)))return;setBusy(true);
 try{const reply=await window.keyboard.returnToStandard({layer,id:$(name+'-source').value});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillMedia();fillLayer();$(name+'-status').textContent='Standard assignment verified by readback.';}
 catch(e){$(name+'-status').textContent=e.message;}finally{setBusy(false);}
};
const calibrationPanel=document.createElement('section');calibrationPanel.className='panel';calibrationPanel.hidden=true;
calibrationPanel.innerHTML='<small>HALL EFFECT</small><h2>Calibration</h2><p>Read the saved sensor ranges for every switch. Reading creates a local backup and preserves the current calibration.</p><button id="calibration-read">Refresh calibration</button><button id="calibration-start">Calibrate all</button><button id="calibration-selected">Calibrate selected key</button><button id="calibration-finish" hidden>Finish</button><button id="calibration-cancel" class="secondary" hidden>Cancel</button><p id="calibration-status" role="status" aria-live="polite">Not read yet.</p><div id="calibration-map" class="keyboard" aria-label="Saved switch calibration"></div><p>OK = a saved working sensor range. Not calibrated = factory/reset baseline 2000 / 2200. Error = an unexpected range. Empty = both values are zero.</p><p><strong>Selected-key flow:</strong> press only the selected switch, choose Finish, then confirm the vendor save prompt. The keyboard may reconnect.</p>';
pendingPanel.after(calibrationPanel);
let calibrationActive=false,calibrationStateKnown=false,calibrationPoll=null;
function stopCalibrationPoll(){if(calibrationPoll){clearInterval(calibrationPoll);calibrationPoll=null;}}
function startCalibrationPoll(){stopCalibrationPoll();calibrationPoll=setInterval(async()=>{if(!calibrationActive||busy)return;try{await refreshCalibration(true);}catch(_error){}},1000);}
function setCalibrationActive(value){calibrationActive=value;$('calibration-start').hidden=value;$('calibration-selected').hidden=value;$('calibration-finish').hidden=!value;$('calibration-cancel').hidden=!value;}
function updateSelectedCalibrationButton(){
  $('calibration-selected').disabled=busy||!calibrationStateKnown||calibrationActive||!selectedId;
  $('calibration-selected').title=selectedId?`Calibrate ${profile?.layout.find(k=>k.id===selectedId)?.label||selectedId}`:'Select a switch first';
  $('calibration-start').disabled=busy||!calibrationStateKnown||calibrationActive;
  $('calibration-finish').disabled=busy||!calibrationStateKnown||!calibrationActive;
  $('calibration-cancel').disabled=busy||!calibrationStateKnown||!calibrationActive;
}
async function restoreCalibrationState(){
  calibrationStateKnown=false;updateSelectedCalibrationButton();
  if(typeof stopCalibrationPoll==='function')stopCalibrationPoll();
  try{
    const reply=await window.keyboard.calibrationState();
    if(!reply.ok)throw new Error(reply.error);
    setCalibrationActive(reply.result.active);
    calibrationStateKnown=true;
    if(reply.result.recoveryError){
      $('calibration-status').textContent='Previous calibration session could not be recovered: '+reply.result.recoveryError+'. Existing backups were retained. Refresh calibration to inspect current ranges.';
    }else if(reply.result.phase==='interrupted'){
      $('calibration-status').textContent='An interrupted calibration session was recovered. Device calibration state is unknown. Refresh calibration to compare saved ranges with the retained backup. No command was sent automatically.';
    }
    if(reply.result.active){
      const selected=reply.result.selectedId;
      const label=profile?.layout.find(k=>k.id===selected)?.label||selected;
      $('calibration-status').textContent='An active calibration session was restored.'+(selected?` Press only ${label}.`:'')+' Choose Finish or Cancel when ready.';
      if(typeof startCalibrationPoll==='function')startCalibrationPoll();
    }else if(['finished','canceled'].includes(reply.result.phase)){
      $('calibration-status').textContent='Previous calibration '+(reply.result.phase==='finished'?'Finish':'Cancel')+' command was sent. Use Refresh calibration to verify saved ranges against the session backup.';
    }
  }catch(error){$('calibration-status').textContent=`Could not restore calibration session: ${error.message}. Reopen Calibration to retry.`;}
  finally{updateSelectedCalibrationButton();}
}
async function readCalibrationAfterReconnect(){
  let lastError;
  for(let attempt=0;attempt<5;attempt++){
    try{await refreshCalibration();return;}
    catch(error){lastError=error;if(attempt<4)await new Promise(resolve=>setTimeout(resolve,500));}
  }
  throw new Error(`Calibration command was sent, but readback is pending: ${lastError.message}. Use Refresh calibration after the keyboard reconnects. Do not repeat Finish.`);
}
async function calibrationCommand(command){
  if(busy||!calibrationStateKnown||command===1&&calibrationActive||command!==1&&!calibrationActive)return;
  setBusy(true);
  $('calibration-status').textContent=command===1?'Starting calibration...':command===2?'Finishing calibration...':'Canceling calibration...';
  try{
    const reply=await window.keyboard.calibrationCommand(command);
    if(!reply.ok)throw new Error(reply.error);
    setCalibrationActive(command===1);
    if(command===1){
      $('calibration-status').textContent='Calibration started. Saved ranges update every second. Press switches in any order, then choose Finish.';if(typeof startCalibrationPoll==='function')startCalibrationPoll();
    }else{
      if(typeof stopCalibrationPoll==='function')stopCalibrationPoll();
      await new Promise(r=>setTimeout(r,1500));
      await readCalibrationAfterReconnect();
      $('calibration-status').textContent=(command===2?'Finish command sent. ':'Cancel command sent. ')+$('calibration-status').textContent;
    }
  }catch(error){$('calibration-status').textContent=error.message;}
  finally{setBusy(false);}
}
$('calibration-start').onclick=()=>calibrationCommand(1);
$('calibration-selected').onclick=async()=>{
  if(busy||!calibrationStateKnown||calibrationActive||!selectedId)return;
  setBusy(true);$('calibration-status').textContent=`Starting selected-key calibration for ${profile?.layout.find(k=>k.id===selectedId)?.label||selectedId}...`;
  try{const reply=await window.keyboard.calibrateSelected(selectedId);if(!reply.ok)throw new Error(reply.error);setCalibrationActive(true);$('calibration-status').textContent=`Selected-key calibration started for ${profile?.layout.find(k=>k.id===selectedId)?.label||selectedId}. Press only this key, then choose Finish.`;startCalibrationPoll();}
  catch(error){$('calibration-status').textContent=error.message;}finally{setBusy(false);updateSelectedCalibrationButton();}
};
$('calibration-finish').onclick=()=>{
  const prompt='Calibration finished, save calibration values?\n\nSaved values will automatically restart the keyboard.';
  if(window.confirm(prompt))calibrationCommand(2);
};
$('calibration-cancel').onclick=()=>calibrationCommand(3);
async function refreshCalibration(silent=false){
    const reply=await window.keyboard.readCalibration();if(!reply.ok)throw new Error(reply.error);
    const data=reply.result;
    const fragment=document.createDocumentFragment();
    for(const physical of data.layout){
      const record=data.records[physical.row*14+physical.col];
      const key=document.createElement('div');key.className='calibration-key';key.dataset.id=physical.id;key.dataset.state=record.rangeStatus;
      key.style.left=`${3+physical.x/680*94}%`;key.style.top=`${18+physical.y*1.65}px`;key.style.width=`${physical.width/680*94}%`;
      for(const value of [physical.label||'Space',record.rangeStatus==='ok'?'OK':record.rangeStatus,`${record.min} / ${record.max}`]){const label=document.createElement('span');label.textContent=value;key.appendChild(label);}
      key.title=`${physical.label}: sensor min ${record.min}, max ${record.max}, model ${record.model}`;
      fragment.appendChild(key);
    }
    $('calibration-map').replaceChildren(fragment);
    const summary=Object.entries(data.statusSummary||{}).map(([name,count])=>`${name}: ${count}`).join(' ? ');
    if(!silent)$('calibration-status').textContent=`Read ${data.layout.length} switches${summary?` ? ${summary}`:''}. Backup: ${data.backup}`;
    if(data.comparison){
      const result=data.comparison;
      const names=result.changedKeys.map(k=>k.label||k.id).join(', ')||'none';
      const cancel=result.cancelVerified===true?' Cancel verified: saved calibration unchanged.':result.cancelVerified===false?' Cancel verification failed: saved calibration differs from the backup.':'';
      if(!silent)$('calibration-status').textContent+=` Changed switches: ${names}. Unchanged: ${result.unchangedKeyCount}/${data.layout.length}. Other changed records: ${result.hiddenRecordChanges}.${cancel}`;
      if(!silent&&result.selectedScope){
        const scope=result.selectedScope;
        $('calibration-status').textContent+=scope.verified?' Selected-key calibration verified: only the selected range changed; all other records are unchanged.':!scope.otherRecordsUnchanged?' Selected-key isolation failed: other calibration records changed. See the comparison report.':!scope.selectedChanged?' Selected range did not change; a new calibration result is not verified.':' Selected-key calibration is not yet verified.';
        $('calibration-status').textContent+=' Report: '+result.report;
      }
    }
}
$('calibration-read').onclick=async()=>{
  if(busy)return;setBusy(true);$('calibration-status').textContent='Reading calibration...';
  try{await refreshCalibration();}
  catch(error){$('calibration-status').textContent=error.message;}
  finally{setBusy(false);}
};
const profileBar=document.createElement('div'); profileBar.className='profiles';
for(let i=0;i<2;i++) {
  const button=document.createElement('button'); button.textContent=`M${i+1}`;
  button.title=`Read and edit device profile M${i+1}`;
  button.onclick=()=>loadProfile(i); profileBar.appendChild(button);
}
hePanel.before(profileBar);
const selectionBar=document.createElement('div');selectionBar.className='selection-bar';
selectionBar.innerHTML='<button id="select-multiple" class="secondary" aria-pressed="false">Select multiple</button><button id="select-all-keys" class="secondary">Select all keys</button><button id="select-one-key" class="secondary">Keep one key</button><span id="selection-summary"></span><p>Click to select a switch. Use Select multiple or Ctrl / Command + click to add switches. Apply writes only to the selected group.</p>';
$('keyboard').before(selectionBar);
function refreshSelection(){
  document.querySelectorAll('.key').forEach(b=>{const selected=selectedIds.has(b.dataset.id);b.classList.toggle('chosen',selected);b.setAttribute('aria-pressed',String(selected));});
  $('selection-summary').textContent=`${selectedIds.size} switch${selectedIds.size===1?'':'es'} selected`;
  updateSelectedCalibrationButton();
  $('save').textContent=selectedIds.size>1?`Apply (${selectedIds.size} keys)`:'Apply';
  $('save').title='Apply the displayed mode and its values to the selected switches';
}
$('select-multiple').onclick=()=>{multipleSelection=!multipleSelection;$('select-multiple').setAttribute('aria-pressed',String(multipleSelection));};
$('select-all-keys').onclick=()=>{if(busy||!profile)return;selectedIds=new Set(profile.layout.map(k=>k.id));refreshSelection();};
$('select-one-key').onclick=()=>{if(busy||!profile)return;selectedIds=new Set([selectedId]);refreshSelection();};
const fileActions=document.createElement('div');fileActions.className='actions';
fileActions.innerHTML='<button id="export-he" class="secondary">Export HE JSON</button><button id="import-he" class="secondary">Import HE JSON</button><span>HE settings only; import replaces the selected profile.</span>';
hePanel.appendChild(fileActions);
async function profileFile(importing){
  if(busy||!profile)return;setBusy(true);
  try{
    const reply=await (importing?window.keyboard.importHe(layer):window.keyboard.exportHe(layer));
    if(!reply.ok)throw new Error(reply.error);if(reply.result.canceled)return;
    if(importing){profile=reply.result;showSelected();$('status').textContent=`Imported and verified M${layer+1}: ${reply.result.changed} switches changed.`;}
    else $('status').textContent='HE profile exported.';
  }catch(error){$('status').textContent=error.message;}finally{setBusy(false);}
}
$('export-he').onclick=()=>profileFile(false);$('import-he').onclick=()=>profileFile(true);
function setBusy(value) {
  busy=value;
  document.querySelectorAll('main button, main input, main select').forEach(el=>{el.disabled=value;});
  updateLightingControls();
  $('save').disabled=value||!profile;
  for(const id of ['select-multiple','select-all-keys','select-one-key'])$(id).disabled=value||!profile;
  $('mode-mechanical').disabled=value||!profile;$('mode-rt').disabled=value||!profile;
  $('export-he').disabled=value||!profile;$('import-he').disabled=value||!profile;
  $('apply').disabled=value||!profile;
  $('apply').title='Apply these values to every switch in the edited profile';
  $('preset-off').disabled=value||!programming;
  $('preset-off').textContent='Off';
  $('preset-off').title='Disable WASD DKS and A/D SNAP in the current profile; custom assignments are checked first';
  $('pair-apply').disabled=value||!programming;
  $('pair-disable').disabled=value||!programming;
  $('dks-apply').disabled=value||!programming;$('dks-disable').disabled=value||!programming;
  $('dks-preview-all').disabled=value||!programming;
  $('dks-wasd').disabled=value||!programming;$('dks-wasd-disable').disabled=value||!programming;
  $('snap-ad').disabled=value||!programming;$('snap-ad-disable').disabled=value||!programming;
  for(const name of ['hotkey','modify','layer','media','remap']) {
    const [row,col]=$(name+'-source').value.split(':').map(Number);
    const key=programming?.keys.find(k=>k.row===row&&k.col===col);
    if(name==='media'||name==='layer')updateStandardReturn(name,key);
    $(name+'-apply').disabled=value||!key||!(name==='media'?[0,2]:name==='layer'?[0,3]:[0]).includes(key.mode)||
      (name==='media'&&!$('media-action').value)||
      (name==='remap'&&$('remap-target').value===$('remap-source').value);
  }
  const lockSource=$('remap-source').value;
  const lockKey=programming?.keys.find(k=>`${k.row}:${k.col}`===lockSource);
  for(const id of ['key-enabled','key-enabled-apply'])$(id).disabled=value||!lockKey||![0,2,3,4,5,6].includes(lockKey.mode);
  $('programming-reset').disabled=value||!programming;
  $('device-fps').disabled=value||!deviceSettings?.canEditFps;
  $('device-mode-apply').disabled=value||!deviceSettings?.canEditPerformance;
  settingsPanel.querySelectorAll('[data-performance-mode]').forEach(button=>{button.disabled=value||!deviceSettings?.canEditPerformance;});
  updateSelectedCalibrationButton();
  updateProgrammingIndicators();updateKeyValues();
  if(!value&&document.body.dataset.page==='programming'&&typeof syncProgrammingSelection==='function')syncProgrammingSelection();
}
function showSelected() {
  const physical=profile?.layout.find(k=>k.id===selectedId);
  if(!physical)return;
  const key=profile.keys.find(k=>k.row===physical.row&&k.col===physical.col);
  if(!key)throw new Error('Selected key is absent from device data');
  $('selected').textContent=physical.label;
  travelFields.forEach(f=>{$(f).value=key[f].toFixed(3);});
  $('rt').checked=key.rtOn;
  $('mechanical-fields').hidden=key.rtOn;$('rt-fields').hidden=!key.rtOn;
  $('mode-mechanical').setAttribute('aria-pressed',String(!key.rtOn));$('mode-rt').setAttribute('aria-pressed',String(key.rtOn));
  const values=displayTravel(key);$('selected-release').textContent=values.release;$('selected-trigger').textContent=values.trigger;
  updateKeyValues();
  refreshSelection();
}
function displayTravel(key){return {trigger:(key.rtOn?key.trigger:key.fixedDown).toFixed(3),release:(key.rtOn?key.release:key.fixedUp).toFixed(3)};}
const keyStateSummary=document.createElement('p');keyStateSummary.id='key-state-summary';keyStateSummary.setAttribute('role','status');
$('keyboard').after(keyStateSummary);
function updateProgrammingIndicators(){
 const disabled=[];
 for(const button of $('keyboard').querySelectorAll('.key')){
  const assignment=programming?.keys.find(k=>k.row+':'+k.col===button.dataset.id);
  const off=assignment?.locked===1;button.classList.toggle('key-off',off);
  if(!profile){const unavailable=button.querySelector('.key-label').textContent+', device state unavailable';button.title=unavailable;button.setAttribute('aria-label',unavailable);}
  if(off)disabled.push(button.querySelector('.key-label').textContent);
 }
 keyStateSummary.textContent=!programming?'Key enabled states unavailable.':disabled.length?'M'+(layer+1)+' - Disabled keys: '+disabled.join(', ')+'. Select a key in Remap - Off / Enable key to enable it.':'M'+(layer+1)+' - All keys enabled.';
}
function updateKeyValues(){
  if(!profile)return;
  for(const button of document.querySelectorAll('.key')){
    const key=profile.keys.find(k=>`${k.row}:${k.col}`===button.dataset.id);if(!key)continue;
    const values=displayTravel(key),mode=key.rtOn?'RT':'Mechanical';
    button.querySelector('.key-release').textContent=values.release;button.querySelector('.key-trigger').textContent=values.trigger;
    const description=`${button.querySelector('.key-label').textContent}, ${mode}, Trig ${values.trigger} mm, Release ${values.release} mm`;
    const assignment=programming?.keys.find(k=>k.row+':'+k.col===button.dataset.id);
    const state=assignment?(assignment.locked===1?', key disabled':', key enabled'):', key enabled state unavailable';
    button.title=description+state;button.setAttribute('aria-label',description+state);
  }
}
function drawKeyboard() {
  $('keyboard').replaceChildren();
  for(const key of profile.layout) {
    const button=document.createElement('button');
    button.className='key';button.dataset.id=key.id;
    for(const [className,text] of [['key-release release-value',''],['key-label',key.label||'Space'],['key-trigger trigger-value','']]){const span=document.createElement('span');span.className=className;span.textContent=text;button.appendChild(span);}
    button.style.left=`${3+key.x/680*94}%`;
    button.style.top=`${18+key.y*1.65}px`;
    button.style.width=`${key.width/680*94}%`;
    button.setAttribute('aria-label',key.label||'Space');
    button.onclick=event=>{
      if(busy)return;
      if(document.body.dataset.page==='range'||multipleSelection||event.ctrlKey||event.metaKey){
        if(selectedIds.has(key.id)){if(selectedIds.size===1)return;selectedIds.delete(key.id);if(key.id===selectedId){selectedId=[...selectedIds][0];showSelected();}}
        else selectedIds.add(key.id);
        refreshSelection();
      }else{selectedIds=new Set([key.id]);selectedId=key.id;showSelected();}
    };
    $('keyboard').appendChild(button);
  }
}
async function loadProfile(nextLayer=layer) {
  if(busy)return;
  discardLightingDraft();
  setBusy(true);$('status').textContent=`Reading M${nextLayer+1} from keyboardâ€¦`;
  try {
    const reply=await window.keyboard.readProfile(nextLayer);
    if(!reply.ok)throw new Error(reply.error);
    layer=nextLayer;profile=reply.result;
    $('preset-preview').textContent=`M${layer+1}: DKS changes W, A, S and D (W/S and A/D targets, interval 20). SNAP pairs A and D and keeps W/S unchanged. DKS replaces A/D SNAP. Off disables both presets.`;
    $('preset-status').textContent='';
    programming=null;
    drawKeyboard();showSelected();
    for(const [id,fallback] of [['pair-first','2:1'],['pair-second','2:3'],['dks-source','2:1'],['dks-target','2:3']]){
      const select=$(id),previous=select.value||fallback;select.replaceChildren();
      for(const key of profile.layout){const option=document.createElement('option');option.value=key.id;option.textContent=`${key.label || 'Space'} (${key.row + 1}:${key.col + 1})`;select.appendChild(option);}
      if(id==='dks-target')for(const [action,label] of [['left-button','Left mouse button'],['right-button','Right mouse button'],['middle-button','Middle mouse button'],['wheel-up','Scroll up'],['wheel-down','Scroll down'],['up','Move mouse up'],['down','Move mouse down'],['left','Move mouse left'],['right','Move mouse right']]){
        const option=document.createElement('option');option.value=`mouse:${action}`;option.textContent=label;select.appendChild(option);
      }
      select.value=previous;
    }
    const programmed=await window.keyboard.readProgramming(layer);
  if(programmed.ok){programming=programmed.result;showPairState();showDksState();fillRemap();fillLayer();fillMedia();fillModify();}
    else $('pair-status').textContent=programmed.error;
    [...profileBar.children].forEach((b,i)=>b.classList.toggle('active',i===layer));
    document.querySelector('.online').textContent='Connected - device data loaded';
    $('status').textContent=`M${layer+1} read from keyboard. Select a switch to edit.`;
  } catch(error) {
    profile=null;programming=null;
    document.querySelector('.online').textContent='Device read unavailable: '+error.message;
    $('status').textContent=error.message;
  } finally {setBusy(false);}
}
$('read').onclick=()=>loadProfile();
$('save-memory').onclick=async()=>{if(busy)return;setBusy(true);$('status').textContent='Saving to device memory...';try{const reply=await window.keyboard.saveToDeviceMemory();if(!reply.ok)throw new Error(reply.error);$('status').textContent='Save command acknowledged. Power-cycle verification is still required.';}catch(e){$('status').textContent=e.message;}finally{setBusy(false);}};
async function saveChanges(all=false) {
  if(busy||!profile)return;
  const request={id:selectedId,ids:[...selectedIds],layer,rtOn:$('rt').checked};
  for(const field of travelFields) {
    if(!$(field).checkValidity()){$(field).reportValidity();return;}
    request[field]=$(field).valueAsNumber;
  }
  const current=profile.keys.find(k=>`${k.row}:${k.col}`===selectedId);
  if(!all&&selectedIds.size===1&&current&&current.rtOn===request.rtOn&&travelFields.every(f=>current[f]===request[f]))return;
  setBusy(true);$('status').textContent='Saving and reading back the selected switchâ€¦';
  try {
    const reply=await (all?window.keyboard.applyAll(request):window.keyboard.saveSelected(request));
    if(!reply.ok)throw new Error(reply.error);
    if(all||selectedIds.size>1) profile=reply.result;
    else {
      const saved=reply.result.key;
      profile.keys[profile.keys.findIndex(k=>k.row===saved.row&&k.col===saved.col)]=saved;
    }
    showSelected();$('status').textContent='Applied to keyboard and verified by readback.';
  } catch(error) {showSelected();$('status').textContent=error.message;}
  finally{setBusy(false);}
}
$('save').onclick=()=>saveChanges();
function changeMode(rtOn){
  if(busy||!profile)return;
  $('rt').checked=rtOn;
  $('mechanical-fields').hidden=rtOn;$('rt-fields').hidden=!rtOn;
  $('mode-mechanical').setAttribute('aria-pressed',String(!rtOn));$('mode-rt').setAttribute('aria-pressed',String(rtOn));
}
$('mode-mechanical').onclick=()=>changeMode(false);$('mode-rt').onclick=()=>changeMode(true);
const editHint=document.createElement('p');editHint.textContent='Choose a mode and values, then Apply to the selected switches. Apply to all writes to the entire profile.';
hePanel.querySelector('.panel-head').after(editHint);
$('apply').onclick=()=>saveChanges(true);
function showPairState(){
  if(!programming)return;
  const names={0:'Standard',2:'Media',3:'FN/layer',4:'DKS',5:'Snap Tap',6:'SOCD / AD Cancel'};
  $('pair-current').textContent=['pair-first','pair-second'].map(id=>{
    const physical=profile.layout.find(k=>k.id===$(id).value);
    const key=programming.keys.find(k=>k.row===physical.row&&k.col===physical.col);
    return `${physical.label}: ${names[key.mode]||'Other mode'}${key.locked?' (key disabled)':''}`;
  }).join(' · ');
}
function showDksState(){
  const [row,col]=$('dks-source').value.split(':').map(Number),key=programming?.keys.find(k=>k.row===row&&k.col===col);
  if(!key)return;
  if(key.dks.type===0&&key.dks.row>0)$('dks-target').value=`${key.dks.row-1}:${key.dks.col}`;
  if(key.dks.type===1)$('dks-target').value=key.dks.mouseAction?`mouse:${key.dks.mouseAction}`:'';
  $('dks-interval').value=key.mode===4?key.dks.interval:(key.dks.interval>=10&&key.dks.interval<=100?key.dks.interval:20);
  $('dks-status').textContent=key.mode===4?(key.locked?'DKS assigned; key disabled.':'DKS enabled.'):`DKS disabled (assignment mode ${key.mode}).`;
}
$('dks-source').onchange=showDksState;
async function applyDks(enabled){
  if(busy||!programming)return;
  if(enabled&&!$('dks-interval').reportValidity())return;
  setBusy(true);$('dks-status').textContent='Applying and verifying DKS...';
  try{
    const reply=await window.keyboard.setDks({layer,id:$('dks-source').value,target:$('dks-target').value,interval:$('dks-interval').valueAsNumber,enabled});
    if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();$('dks-status').textContent='DKS assignment verified.';
  }catch(error){$('dks-status').textContent=error.message;}finally{setBusy(false);}
}
async function applyWasd(enabled){
  if(busy||!programming)return;
  setBusy(true);$('preset-status').textContent='Applying WASD and verifying all assignments...';
  try{
    const reply=enabled?await window.keyboard.quickPreset({layer,preset:'dks'}):await window.keyboard.setDksWasd({layer,enabled});if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();$('preset-status').textContent=enabled?'DKS enabled on W, A, S and D.':'WASD DKS disabled.';
  }catch(error){$('preset-status').textContent=error.message;}finally{setBusy(false);}
}
async function applySnapPreset(enabled){
  if(busy||!programming)return;
  setBusy(true);$('preset-status').textContent='Applying SNAP to A / D and verifying...';
  try{
    const reply=enabled?await window.keyboard.quickPreset({layer,preset:'snap'}):await window.keyboard.setPair({layer,first:'2:1',second:'2:3',mode:0});
    if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();$('preset-status').textContent=enabled?'SNAP enabled on A and D; W/S unchanged.':'A / D SNAP disabled.';
  }catch(error){$('preset-status').textContent=error.message;}finally{setBusy(false);}
}
$('snap-ad').onclick=()=>applySnapPreset(true);$('snap-ad-disable').onclick=()=>applySnapPreset(false);
$('dks-wasd').onclick=()=>applyWasd(true);$('dks-wasd-disable').onclick=()=>applyWasd(false);
$('preset-off').onclick=async()=>{
  setBusy(true);$('preset-status').textContent='Disabling quick presets and verifying all assignments...';
  try{
    const reply=await window.keyboard.presetOff({layer});if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();
    $('preset-status').textContent=reply.result.changed?'Quick presets disabled. Device readback verified.':'Quick presets are already off.';
  }catch(error){$('preset-status').textContent=error.message;}finally{setBusy(false);}
};
$('dks-apply').onclick=()=>applyDks(true);$('dks-disable').onclick=()=>applyDks(false);
$('pair-first').onchange=showPairState;$('pair-second').onchange=showPairState;
async function applyPair(disable=false){
  if(busy||!programming)return;
  setBusy(true);$('pair-status').textContent='Applying pair and verifying device readbackâ€¦';
  try{
    const reply=await window.keyboard.setPair({layer,first:$('pair-first').value,second:$('pair-second').value,mode:disable?0:Number($('pair-mode').value)});
    if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();$('pair-status').textContent=disable?'Pair disabled and verified.':'Pair applied and verified.';
  }catch(error){$('pair-status').textContent=error.message;}
  finally{setBusy(false);}
}
$('pair-apply').onclick=()=>applyPair();$('pair-disable').onclick=()=>applyPair(true);
const settingsPanel=document.createElement('section');settingsPanel.className='panel';settingsPanel.hidden=true;
settingsPanel.innerHTML='<small>DEVICE SETTINGS</small><div class="performance-card"><div class="performance-heading"><h2 id="performance-name">Performance mode</h2><label class="fps-switch"><span>FPS Enhance</span><input id="device-fps" type="checkbox" disabled></label></div><p>Switching modes reboots the keyboard.</p><div class="performance-modes" role="group" aria-label="Performance mode"><button type="button" data-performance-mode="0" aria-pressed="false">BeastMode</button><button type="button" data-performance-mode="1" aria-pressed="false">EyeMode</button><button type="button" data-performance-mode="2" aria-pressed="false">DevMode</button></div><div class="actions"><button id="device-mode-apply" disabled>Apply mode</button><button id="device-settings-read" class="secondary">Refresh</button></div></div><p>FPS Enhance is independent of the selected mode. It prioritizes scanning the two rows containing WASD; other rows use a lower scan rate.</p><p>Applying either setting reconnects the keyboard. Use Save to device memory to store it.</p><p id="device-settings-status" role="status"></p><p>Other device settings: In development.</p>';
remapPanel.after(settingsPanel);let deviceSettings=null,performanceDraft=null;
function showPerformanceMode(){
 performanceDraft=deviceSettings?.canEditPerformance?deviceSettings.performanceMode:null;
 $('performance-name').textContent=deviceSettings?.performanceName||'Performance mode';
 for(const button of settingsPanel.querySelectorAll('[data-performance-mode]'))button.setAttribute('aria-pressed',String(Number(button.dataset.performanceMode)===performanceDraft));
}
for(const button of settingsPanel.querySelectorAll('[data-performance-mode]'))button.onclick=()=>{
 if(busy||!deviceSettings?.canEditPerformance)return;
 performanceDraft=Number(button.dataset.performanceMode);
 for(const item of settingsPanel.querySelectorAll('[data-performance-mode]'))item.setAttribute('aria-pressed',String(item===button));
 $('device-settings-status').textContent=['BeastMode','EyeMode','DevMode'][performanceDraft]+' selected. Choose Apply mode to write it to the keyboard.';
};
async function deviceSettingsAction(apply=false){
 if(busy||(apply==='mode'?!deviceSettings?.canEditPerformance:apply&&!deviceSettings?.canEditFps))return;
 const enabled=$('device-fps').checked,mode=performanceDraft;setBusy(true);$('device-settings-status').textContent=apply?'Applying and waiting for keyboard reconnection...':'Reading device settings...';
 let refreshAfterReconnect=false;
 try{
  const reply=await (apply==='mode'?window.keyboard.setPerformanceMode(mode):apply?window.keyboard.setFpsEnhance(enabled):window.keyboard.readDeviceSettings());
   if(!reply.ok)throw Error(reply.error);deviceSettings=reply.result;$('device-fps').checked=deviceSettings.fpsEnhance===1;showPerformanceMode();refreshAfterReconnect=apply==='mode';
   $('device-settings-status').textContent=apply?(apply==='mode'?'Performance mode command accepted. The keyboard is reconnecting; use Refresh after it returns.':'FPS Enhance applied. Device settings and preservation of other sections verified.'):'Performance mode and FPS Enhance read from keyboard.';
 }catch(error){deviceSettings=null;showPerformanceMode();$('device-settings-status').textContent=error.message;}
 finally{setBusy(false);}
 if(refreshAfterReconnect){await loadProfile(layer);$('device-settings-status').textContent='Performance mode applied and keyboard reconnected.';}
}
$('device-mode-apply').onclick=()=>deviceSettingsAction('mode');
$('device-settings-read').onclick=()=>deviceSettingsAction();$('device-fps').onchange=()=>deviceSettingsAction(true);
document.querySelectorAll('aside .nav').forEach((nav,i)=>{
  nav.dataset.title=nav.textContent.trim();
  if(![0,1,3].includes(i)){const badge=document.createElement('small');badge.textContent='In development';badge.className='development-badge';nav.appendChild(badge);}
  nav.onclick=()=>{
    if(busy)return;
    showSelected();
    pendingPanel.hidden=true;calibrationPanel.hidden=true;remapPanel.hidden=true;lightingPanel.hidden=true;settingsPanel.hidden=true;
    document.querySelectorAll('aside .nav').forEach(item=>item.classList.toggle('active',item===nav));
    if(i<2){advancedPanel.hidden=true;remapPanel.hidden=true;hePanel.hidden=false;hePanel.scrollIntoView({behavior:'smooth'});return;}
    if(i===2){hePanel.hidden=true;advancedPanel.hidden=true;pendingPanel.hidden=true;remapPanel.hidden=false;fillRemap();fillLayer();fillMedia();fillModify();remapPanel.scrollIntoView({behavior:'smooth'});return;}
    if(i===3){hePanel.hidden=true;advancedPanel.hidden=false;fillHotKey();showPairState();showDksState();advancedPanel.scrollIntoView({behavior:'smooth'});return;}
    if(i===6){hePanel.hidden=true;advancedPanel.hidden=true;settingsPanel.hidden=false;deviceSettingsAction();return;}
    if(i===5){hePanel.hidden=true;advancedPanel.hidden=true;lightingPanel.hidden=false;lightingBrightness();return;}
    hePanel.hidden=true;advancedPanel.hidden=true;pendingPanel.hidden=false;
    $('pending-title').textContent=nav.dataset.title;
  };
});
for(const panel of [remapPanel,advancedPanel]){
 const back=document.createElement('button');back.className='secondary';back.textContent='Back';back.dataset.action='programming-back';
 back.onclick=()=>{
  if(busy)return;
  // Back only discards UI drafts. Never dispatch a device command here.
  fillRemap();fillLayer();fillMedia();fillModify();fillHotKey();showPairState();showDksState();
  document.querySelector('aside .nav').click();
 };
 panel.appendChild(back);
}
const calibrationNav=document.createElement('div');calibrationNav.className='nav';calibrationNav.textContent='Calibration';document.querySelector('aside .bottom').before(calibrationNav);
calibrationNav.onclick=()=>{
  if(busy)return;showSelected();hePanel.hidden=true;advancedPanel.hidden=true;pendingPanel.hidden=true;remapPanel.hidden=true;lightingPanel.hidden=true;settingsPanel.hidden=true;calibrationPanel.hidden=false;
  document.querySelectorAll('aside .nav').forEach(item=>item.classList.toggle('active',item===calibrationNav));
  calibrationPanel.scrollIntoView({behavior:'smooth'});
  restoreCalibrationState();
};
setBusy(false);Promise.all([restoreCalibrationState(),loadProfile()]).catch(error=>{$("lighting-mode-status").textContent=error.message;});


