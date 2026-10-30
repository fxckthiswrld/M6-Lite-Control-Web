'use strict';
const $ = id => document.getElementById(id);
function updateLightingSlider(id,valueId){const input=$(id),output=$(valueId);if(input&&output){const percent=id.includes('brightness')||id==='underlight-speed'||id==='lighting-speed';output.value=percent?`${input.value}%`:input.value;}}
function speedToPercent(value,min,max){if(!Number.isFinite(value)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return '';return Math.round((value-min)*100/(max-min));}
function percentToSpeed(percent,min,max){if(!Number.isFinite(percent)||!Number.isFinite(min)||!Number.isFinite(max)||max<=min)return min;return Math.round(min+(percent/100)*(max-min));}
function speedToPercentUI(value,min,max){const percent=speedToPercent(value,min,max);return percent===''?'':100-percent;}
function percentToSpeedUI(percent,min,max){return percentToSpeed(100-percent,min,max);}
const travelFields = ['head','bottom','trigger','release','fixedDown','fixedUp'];
let layer = 0, selectedId = '2:1', profile = null, busy = false, heFieldsVisible = false;
let deviceWasConnected = false, connectionRecoveryNeeded = false, recoveryTimer = null, recoveryInFlight = false, startupConnectInFlight = false, expectedDeviceRestart = false;
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
dksAllDialog.innerHTML='<h2>Assign DKS to all switches</h2><p id="dks-all-summary"></p><p>This replaces Standard and DKS assignments across the selected profile. Other advanced assignments must be disabled first.</p><div class="actions"><button id="dks-all-confirm">Assign to all</button><button id="dks-all-cancel" class="secondary">Cancel</button></div>';
document.body.appendChild(dksAllDialog);
let dksAllDraft=null;
$('dks-all-cancel').onclick=()=>dksAllDialog.close();
dksAllDialog.addEventListener('close',()=>{dksAllDraft=null;});
dksAllButton.onclick=()=>{
  if(busy||!programming||!profile||!$('dks-interval').reportValidity()||!$('dks-target').value)return;
  dksAllDraft={layer,target:$('dks-target').value,interval:$('dks-interval').valueAsNumber};
  const conflicts=profile.layout.filter(k=>![0,4].includes(programming.keys[k.row*14+k.col].mode));
  $('dks-all-summary').textContent=`M${layer+1}: ${profile.layout.length} switches â†’ ${$('dks-target').selectedOptions[0].textContent}; interval ${dksAllDraft.interval}. ${conflicts.length?`${conflicts.length} switches have conflicting assignments.`:'All switches use Standard or DKS mode.'}`;
  $('dks-all-confirm').disabled=conflicts.length>0;dksAllDialog.showModal();
};
$('dks-all-confirm').onclick=async()=>{
  const request=dksAllDraft;
  if(!request||busy||request.layer!==layer)return;
  dksAllDialog.close();setBusy(true);$('dks-status').textContent='Applying DKS to all switches and verifying...';
  try{
    const reply=await window.keyboard.setDksAll(request);if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();updateProgrammingIndicators();clearDksSelection();$('dks-status').textContent='DKS applied to all switches. Device readback verified.';
  }catch(error){$('dks-status').textContent=error.message;}finally{setBusy(false);}
};
document.querySelector('header').after(presetPanel);
presetPanel.insertAdjacentHTML('afterbegin','<small>QUICK PRESETS</small><h2>DKS / SNAP / SOCD</h2><p id="preset-preview"></p><div class="actions"><button id="dks-wasd">DKS - WASD</button><button id="dks-wasd-disable" class="secondary">Disable WASD DKS</button><button id="snap-ad">SNAP - A / D</button><button id="cl-ad">SOCD - A / D</button><button id="snap-ad-disable" class="secondary">Disable A / D SNAP</button><button id="preset-defaults" class="secondary">Restore WASD defaults</button><button id="preset-off" disabled title="Disable quick presets in the current profile">Off</button></div><p id="preset-status" role="status" aria-live="polite"></p><hr>');
advancedPanel.insertAdjacentHTML('beforeend','<hr><h2>HotKey</h2><p>Repeat one standard key at a controlled interval. The source must be in Standard mode.</p><div class="controls"><label>Source switch<select id="hotkey-source"></select></label><label>Interval<input id="hotkey-interval" type="number" min="0" max="255" step="1" value="23"></label></div><p id="hotkey-current"></p><div class="actions"><button id="hotkey-apply">Apply HotKey</button><span id="hotkey-status" role="status" aria-live="polite"></span></div>');
hePanel.after(advancedPanel);
const pendingPanel=document.createElement('section');pendingPanel.className='panel';pendingPanel.hidden=true;
pendingPanel.innerHTML='<small>IN DEVELOPMENT</small><h2 id="pending-title"></h2><p>This section is in development. Device controls will appear here when ready.</p>';
advancedPanel.after(pendingPanel);
const lightingPanel=document.createElement('section');lightingPanel.className='panel lighting-panel';lightingPanel.hidden=true;
lightingPanel.innerHTML='<small>LIGHTING</small><h2>Lighting control</h2><div class="lighting-section lighting-global"><h3>Back Light brightness</h3><label class="range-control"><input id="lighting-brightness" type="range" min="0" max="100" step="1" disabled><output id="lighting-brightness-value">â€”</output></label><div class="actions"><button id="lighting-read">Refresh</button><button id="lighting-apply" disabled>Apply</button></div><p id="lighting-status" role="status" aria-live="polite">Read Back Light brightness from the keyboard.</p></div>';
pendingPanel.after(lightingPanel);
lightingPanel.insertAdjacentHTML('afterbegin','<div class="lighting-service-controls" hidden aria-hidden="true"><input id="backlight-enabled" type="checkbox" disabled><button id="backlight-enabled-apply" disabled>Apply Back Light power</button></div>');
lightingPanel.insertAdjacentHTML('beforeend','<hr><h3>Back Light effect</h3><div class="controls"><label>Effect<select id="lighting-mode" disabled><option value="2">Normal</option><option value="5">Stream</option><option value="4">Gradient</option><option value="6">Star</option><option value="7">Roll</option><option value="3">Breath</option></select></label></div><button id="lighting-mode-apply" disabled>Apply effect</button><p id="lighting-mode-status" role="status">Normal lighting effects are available while the application runs.</p>');
lightingPanel.insertAdjacentHTML('beforeend','<div id="lighting-color-controls"><h3>Current effect color</h3><div class="controls"><label class="toggle-row"><input id="lighting-custom-rgb" type="checkbox" disabled><span>Custom RGB</span></label><label class="color-field">Color<input id="lighting-color" type="color" disabled></label></div><button id="lighting-color-apply" disabled>Apply color</button><p id="lighting-color-note">Choose an effect before editing its color. Single Light can override this color on assigned keys.</p></div>');
lightingPanel.insertAdjacentHTML('beforeend','<div class="lighting-section"><h3>Effect speed</h3><label class="range-control"><input id="lighting-speed" type="range" min="0" max="6000" step="1" disabled><output id="lighting-speed-value">â€”</output></label><button id="lighting-speed-apply" disabled>Apply speed</button><p id="lighting-speed-note">Choose an effect to edit its speed. Normal has no speed control.</p></div>');
lightingPanel.insertAdjacentHTML('beforeend','<div class="direction-control"><h3>Effect direction</h3><label class="toggle-row"><input id="lighting-reverse" type="checkbox" disabled><span>Reverse</span></label><button id="lighting-direction-apply" disabled>Apply direction</button></div>');
lightingPanel.insertAdjacentHTML('beforeend','<hr><h2>Under Light</h2><p>Independent lighting beneath the keyboard.</p><div class="controls"><label>Effect<select id="underlight-mode" disabled><option value="5">Stream</option><option value="3">Breath</option><option value="6">Star</option><option value="4">Gradient</option><option value="7">Normal</option></select></label></div><div class="actions"><button id="underlight-read">Refresh Under Light</button><button id="underlight-apply" disabled>Apply Under Light</button></div><p id="underlight-status" role="status">Normal Sync status is read automatically.</p>');
lightingPanel.insertAdjacentHTML('beforeend','<h3>Under Light color</h3><div class="controls"><label class="toggle-row"><input id="underlight-custom-rgb" type="checkbox" disabled><span>Custom RGB</span></label><label class="color-field">Color<input id="underlight-color" type="color" disabled></label></div><button id="underlight-color-apply" disabled>Apply Under Light color</button><p>The selected color is applied directly for Normal and Breath. Choose an effect before editing its color.</p>');
lightingPanel.insertAdjacentHTML('beforeend','<div class="lighting-section"><h3>Under Light speed</h3><label class="range-control"><input id="underlight-speed" type="range" min="0" max="6000" step="1" disabled><output id="underlight-speed-value">â€”</output></label><button id="underlight-speed-apply" disabled>Apply Under Light speed</button><p id="underlight-speed-note">Choose an effect before editing its speed.</p></div>');
lightingPanel.insertAdjacentHTML('beforeend','<div class="lighting-section"><h3>Under Light brightness</h3><label class="range-control"><input id="underlight-brightness" type="range" min="0" max="100" step="1" disabled><output id="underlight-brightness-value">â€”</output></label><button id="underlight-brightness-apply" disabled>Apply Under Light brightness</button></div>');
lightingPanel.insertAdjacentHTML('beforeend','<h3>Under Light power</h3><label><input id="underlight-enabled" type="checkbox" disabled> Enable Under Light</label><button id="underlight-enabled-apply" disabled>Apply Under Light power</button>');
lightingPanel.insertAdjacentHTML('beforeend','<h3>Under Light synchronization</h3><label><input id="underlight-sync" type="checkbox" disabled> Normal Sync</label><button id="underlight-sync-apply" disabled>Apply Normal Sync</button><p id="underlight-sync-note">Disable Normal Sync to edit independent Under Light effects.</p>');
lightingPanel.insertAdjacentHTML('beforeend','<hr><h2>Single Light</h2><label><input id="single-active" type="checkbox" disabled> Enable Single Light layer</label><button id="single-active-apply" disabled>Apply layer</button><div class="controls"><label>Keys (follows the selection on the keyboard)<select id="single-keys" multiple size="8" disabled></select></label><label><input id="single-enabled" type="checkbox" disabled> Use Single Light color for selected keys</label><label>Color<input id="single-color" type="color" disabled></label></div><button id="single-read">Refresh Single Light</button><button id="single-apply" disabled>Apply color to selected keys</button><button id="single-disable" disabled>Turn off Single Light for selected keys</button><p id="single-status" role="status">Read Single Light from the keyboard.</p><p>Picking a color turns the selected keys and the Single Light layer on automatically. Use Turn off to remove the color from selected keys. Changes are saved to device memory automatically.</p>');
$('single-apply').insertAdjacentHTML('afterend','<div class="lighting-section"><h3>Selected keys brightness</h3><label class="range-control"><input id="single-brightness" type="range" min="0" max="100" step="1" disabled><output id="single-brightness-value">-</output></label><button id="single-brightness-apply" disabled>Apply brightness to selected keys</button><p>Brightness preserves each selected key&rsquo;s RGB color. Applying a color preserves its brightness.</p></div>');
let singleState=null,singleReady=false,singleBrightnessRaw=0;
function showSingleSelection(pushSelection){
 const ids=Array.from($('single-keys').selectedOptions,o=>o.value);
 // The Single Light list and the keyboard picture share one selection, so a change
 // in either view updates both and the color request can never use a stale set.
 if(pushSelection&&ids.length){selectedIds=new Set(ids);selectedId=ids[ids.length-1];refreshSelection();}
 const keys=singleState?.keys.filter(k=>ids.includes(k.id))||[];
 if(keys.length){$('single-color').value=keys[0].color;$('single-enabled').checked=keys[0].enabled;singleBrightnessRaw=keys[0].brightness;$('single-brightness').value=Math.round(singleBrightnessRaw*100/255);updateLightingSlider('single-brightness','single-brightness-value');}
 $('single-status').textContent=keys.length?`${keys.length} key(s) selected. ${keys.some(k=>k.color!==keys[0].color||k.enabled!==keys[0].enabled||k.brightness!==keys[0].brightness)?'Mixed values; each control writes only its displayed setting.':'Saved values shown.'}`:'Click keys on the keyboard to select one or more.';
 updateLightingControls();
}
async function readSingleLight(){
 singleReady=false;const reply=await window.keyboard.readSingleLight();if(!reply.ok)throw Error(reply.error);
 singleState=reply.result;singleReady=true;$('single-active').checked=singleState.enabled;
 const ids=new Set(Array.from($('single-keys').selectedOptions,o=>o.value));$('single-keys').replaceChildren();
 for(const k of singleState.keys){const option=document.createElement('option');option.value=k.id;option.textContent=`${k.label}: ${k.enabled?k.color:'Back Light'}${k.canEdit?'':' (unsupported mode)'}`;option.selected=ids.size?ids.has(k.id):selectedIds.has(k.id);$('single-keys').appendChild(option);}
 showSingleSelection();
 updateLightingPreview();
}
async function singleAction(kind){
 if(busy||(kind!=='read'&&!singleReady))return;
 const listed=Array.from($('single-keys').selectedOptions,o=>o.value),keys=listed.length?listed:[...selectedIds];
 const request=(kind==='keys'||kind==='color')?{keys,color:$('single-color').value}:kind==='enabled'?{keys,enabled:$('single-enabled').checked}:kind==='disable'?{keys,enabled:false}:kind==='layer'?{active:$('single-active').checked}:{keys,brightness:singleBrightnessRaw};
 setBusy(true);
 try{if(kind!=='read'){const reply=await window.keyboard.setSingleLight(request);if(!reply.ok)throw Error(reply.error);}await readSingleLight();if(kind!=='read')$('single-status').textContent=kind==='color'?'Color applied; the selected keys and the Single Light layer are on. Saved to device memory automatically.':kind==='disable'?'Single Light turned off for the selected keys. Saved to device memory automatically.':'Single Light applied; device readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)singleReady=false;if(applied){try{await readSingleLight();}catch{}}$('single-status').textContent=error.message;}finally{setBusy(false);}
}
$('single-keys').onchange=()=>showSingleSelection(true);$('single-read').onclick=()=>singleAction('read');$('single-apply').onclick=()=>singleAction('color');$('single-disable').onclick=()=>singleAction('disable');$('single-active-apply').onclick=()=>singleAction('layer');
$('single-brightness').oninput=()=>{singleBrightnessRaw=Math.round($('single-brightness').valueAsNumber*255/100);updateLightingSlider('single-brightness','single-brightness-value');};
$('single-brightness-apply').onclick=()=>singleAction('brightness');
let lightingBrightnessReady=false,lightingModeReady=false,lightingState=null,lightingSavedBrightness=null,underLightState=null,underLightReady=false,lightingCustomRgbPending=false,underCustomRgbPending=false,lightingSpeedDraft=null,underSpeedDraft=null;
function appliedWithoutSave(error){return /was applied but could not be saved/.test(String(error?.message||''));}
function discardLightingDraft(){
 lightingSpeedDraft=null;underSpeedDraft=null;
 $('backlight-enabled').checked=!!lightingState?.enabled;
 if(singleState){$('single-active').checked=singleState.enabled;showSingleSelection();}
 if(lightingSavedBrightness!==null){$('lighting-brightness').value=Math.round(lightingSavedBrightness*100/255);updateLightingSlider('lighting-brightness','lighting-brightness-value');}
 if(lightingState){$('lighting-mode').value=lightingState.canSwitch?String(lightingState.mode):'';$('lighting-custom-rgb').checked=!!lightingState.customRgb;$('lighting-color').value=lightingState.color||'#000000';}
 $('lighting-speed').min=0;$('lighting-speed').max=100;$('lighting-speed').value=lightingState?.canEditSpeed?speedToPercentUI(lightingState.speed,lightingState.speedMinimum,lightingState.speedMaximum):'';
 $('lighting-reverse').checked=!!lightingState?.reverse;
 if(underLightState)$('underlight-mode').value=underLightState.canSwitch?String(underLightState.mode):'';
 $('underlight-custom-rgb').checked=!!underLightState?.customRgb;$('underlight-color').value=underLightState?.color||'#000000';
 $('underlight-speed').min=0;$('underlight-speed').max=100;$('underlight-speed').value=underLightState?speedToPercentUI(underLightState.speed,underLightState.speedMinimum,underLightState.speedMaximum):'';
 $('underlight-brightness').value=underLightState?Math.round(underLightState.brightness*100/255):'';updateLightingSlider('underlight-brightness','underlight-brightness-value');
 $('underlight-enabled').checked=!!underLightState?.enabled;
 $('underlight-sync').checked=underLightState?.sync===1;
 updateLightingControls();
}
function updateLightingControls(){
 const backPowerReady=lightingModeReady&&lightingState?.canEditEnabled;
 $('backlight-enabled').disabled=busy||!backPowerReady;$('backlight-enabled-apply').disabled=busy||!backPowerReady;
 const singleIds=Array.from($('single-keys').selectedOptions,o=>o.value),editable=singleReady&&singleIds.length>0&&singleIds.every(id=>singleState.keys.find(k=>k.id===id)?.canEdit);
 $('single-keys').disabled=busy||!singleReady;
 for(const id of ['single-apply','single-disable','single-enabled','single-color','single-brightness','single-brightness-apply'])$(id).disabled=busy||!editable;
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
 const lightingCustomMode=Number($('lighting-mode').value)||Number(lightingState?.mode);
 const lightingCustomHidden=![3,5,7].includes(lightingCustomMode);
 const lightingCustomLabel=$('lighting-custom-rgb').closest('label');
 lightingCustomLabel.hidden=lightingCustomHidden;
 if(lightingCustomHidden)lightingCustomLabel.style.setProperty('display','none','important');else lightingCustomLabel.style.removeProperty('display');
 $('lighting-custom-rgb').disabled=busy||!colorReady||!lightingState?.supportsCustomRgb;
 $('lighting-color-apply').disabled=busy||!colorReady;
 $('lighting-color').disabled=busy||!colorReady||(!lightingCustomHidden&&lightingState?.supportsCustomRgb&&!$('lighting-custom-rgb').checked);
 const speedReady=lightingModeReady&&lightingState?.canEditSpeed&&Number($('lighting-mode').value)===lightingState.mode;
 $('lighting-speed').closest('.lighting-section')?.classList.toggle('no-speed',!speedReady);
 $('lighting-speed').disabled=busy||!speedReady;$('lighting-speed-apply').disabled=busy||!speedReady;
 const directionReady=lightingModeReady&&lightingState?.canEditDirection&&Number($('lighting-mode').value)===lightingState.mode;
 $('lighting-reverse').disabled=busy||!directionReady;$('lighting-direction-apply').disabled=busy||!directionReady;
 $('underlight-mode').disabled=busy||!independentReady;$('underlight-apply').disabled=busy||!independentReady;
 const underColorReady=independentReady&&underLightState?.canEditColor&&Number($('underlight-mode').value)===underLightState.mode;
 const underCustomMode=Number($('underlight-mode').value)||Number(underLightState?.mode);
 const underCustomHidden=!underLightState?.supportsCustomRgb||underCustomMode!==3;
 const underCustomLabel=$('underlight-custom-rgb').closest('label');
 underCustomLabel.hidden=underCustomHidden;
 if(underCustomHidden)underCustomLabel.style.setProperty('display','none','important');else underCustomLabel.style.removeProperty('display');
 $('underlight-custom-rgb').disabled=busy||!underColorReady||!underLightState?.supportsCustomRgb;
 $('underlight-color-apply').disabled=busy||!underColorReady;
 $('underlight-color').disabled=busy||!underColorReady||(!underCustomHidden&&underLightState?.supportsCustomRgb&&!$('underlight-custom-rgb').checked);
 const underSpeedReady=independentReady&&underLightState?.canEditSpeed&&Number($('underlight-mode').value)===underLightState.mode;
 const underSpeedBlock=$('underlight-speed')?.closest('.lighting-section');if(underSpeedBlock)underSpeedBlock.classList.toggle('no-speed',!underSpeedReady);
 $('underlight-speed').disabled=busy||!underSpeedReady;$('underlight-speed-apply').disabled=busy||!underSpeedReady;
}
$('backlight-enabled-apply').onclick=async()=>{
 if(busy||!lightingModeReady||!lightingState?.canEditEnabled)return;
 const enabled=$('backlight-enabled').checked;setBusy(true);
 try{const reply=await window.keyboard.setBackLightEnabled(enabled);if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent='Back Light power applied; device readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)lightingModeReady=false;if(applied){try{await readLightingMode();}catch{}}$('lighting-mode-status').textContent=error.message;}finally{setBusy(false);}
};
$('underlight-sync-apply').onclick=async()=>{
 if(busy||!underLightReady||!underLightState?.canEditSync)return;
 const sync=$('underlight-sync').checked;setBusy(true);
 try{const reply=await window.keyboard.setUnderLightSync(sync);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent='Normal Sync applied; device readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)underLightReady=false;if(applied){try{await readUnderLight();}catch{}}$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('underlight-enabled-apply').onclick=async()=>{
 if(busy||!underLightReady||!underLightState?.canEditEnabled)return;
 const enabled=$('underlight-enabled').checked;setBusy(true);
 try{const reply=await window.keyboard.setUnderLightEnabled(enabled);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent='Under Light power applied; device readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)underLightReady=false;if(applied){try{await readUnderLight();}catch{}}$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('underlight-brightness-apply').onclick=async()=>{
 if(busy||!underLightReady)return;
 const value=Math.round($('underlight-brightness').valueAsNumber*255/100);
 if(!Number.isInteger(value)||value<0||value>255){$('underlight-status').textContent='Enter a whole number from 0 to 255.';return;}
 setBusy(true);
 try{const reply=await window.keyboard.setUnderLightBrightness(value);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent='Under Light brightness applied; device readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)underLightReady=false;if(applied){try{await readUnderLight();}catch{}}$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('underlight-speed-apply').onclick=async()=>{
 if(busy||!underLightReady||!underLightState?.canEditSpeed||Number($('underlight-mode').value)!==underLightState.mode)return;
 const percent=$('underlight-speed').valueAsNumber,{speedMinimum:min,speedMaximum:max}=underLightState;
 if(!Number.isInteger(percent)||percent<0||percent>100){$('underlight-status').textContent='Choose a speed from 0 to 100%.';return;}
 const speed=percentToSpeedUI(percent,min,max);
 const request={mode:underLightState.mode,speed};setBusy(true);$('underlight-status').textContent='Applying Under Light speed and verifying device settings...';
 try{const reply=await window.keyboard.setUnderLightSpeed(request);if(!reply.ok)throw Error(reply.error);await readUnderLight();$('underlight-status').textContent=underLightState?.speed!==request.speed?`Under Light speed was not applied (keyboard reports ${underLightState?.speed??'unknown'}).`:'Under Light speed applied; configuration readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)underLightReady=false;if(applied){try{await readUnderLight();}catch{}}$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('underlight-mode').onchange=()=>{underCustomRgbPending=false;underSpeedDraft=null;updateLightingControls();updateLightingPreview();};$('underlight-custom-rgb').onchange=()=>{underCustomRgbPending=true;updateLightingControls();updateLightingPreview();};
$('underlight-color-apply').onclick=async()=>{
 if(busy||!underLightReady||!underLightState?.canEditColor||Number($('underlight-mode').value)!==underLightState.mode)return;
 const request={mode:underLightState.mode,customRgb:underLightState.supportsCustomRgb?($('underlight-custom-rgb').closest('label').hidden?true:$('underlight-custom-rgb').checked):false,color:$('underlight-color').value};setBusy(true);
 $('underlight-status').textContent='Applying Under Light color and verifying device settings...';
 try{const reply=await window.keyboard.setUnderLightColor(request);if(!reply.ok)throw Error(reply.error);await readUnderLight();underCustomRgbPending=false;if(underLightState)$('underlight-custom-rgb').checked=!!underLightState.customRgb;$('underlight-status').textContent=request.customRgb&&underLightState&&!underLightState.customRgb?'Under Light color applied, but the keyboard reported Custom RGB off.':'Under Light color applied; configuration readback verified. Saved to device memory automatically.';}
 catch(error){underCustomRgbPending=false;const applied=appliedWithoutSave(error);if(!applied)underLightReady=false;if(applied){try{await readUnderLight();}catch{}}$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
};
async function readUnderLight(){
 underLightReady=false;const reply=await window.keyboard.readUnderLight();if(!reply.ok)throw Error(reply.error);
 underLightState=reply.result;underSpeedDraft=null;underLightReady=underLightState.canSwitch;
 $('underlight-brightness').value=Math.round(underLightState.brightness*100/255);updateLightingSlider('underlight-brightness','underlight-brightness-value');
 $('underlight-enabled').checked=underLightState.enabled;
 $('underlight-sync').checked=underLightState.sync===1;
 $('underlight-sync-note').textContent=underLightState.sync===0?'':'Disable Normal Sync to edit independent Under Light effects.';
 $('underlight-mode').value=underLightReady?String(underLightState.mode):'';
 if(!underCustomRgbPending)$('underlight-custom-rgb').checked=!!underLightState.customRgb;$('underlight-color').value=underLightState.color||'#000000';
 $('underlight-speed').min=0;$('underlight-speed').max=100;$('underlight-speed').value=underLightState.canEditSpeed?speedToPercentUI(underLightState.speed,underLightState.speedMinimum,underLightState.speedMaximum):'';updateLightingSlider('underlight-speed','underlight-speed-value');
 $('underlight-speed-note').textContent=underLightState.canEditSpeed?'':'This effect has no speed control.';
 $('underlight-speed').closest('.lighting-section')?.classList.toggle('no-speed',!underLightState.canEditSpeed);
 $('underlight-status').textContent=underLightReady?'Effect read from keyboard. Normal Sync status is read automatically.':'This saved Under Light effect is not supported yet.';
 updateLightingPreview();
}
async function underLightAction(apply=false){
 if(busy||(apply&&!underLightReady))return;
 const mode=Number($('underlight-mode').value);setBusy(true);
 try{if(apply){const reply=await window.keyboard.setUnderLightMode(mode);if(!reply.ok)throw Error(reply.error);}await readUnderLight();if(apply)$('underlight-status').textContent='Under Light applied; configuration readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)underLightReady=false;if(applied){try{await readUnderLight();}catch{}}$('underlight-status').textContent=error.message;}
 finally{setBusy(false);}
}
$('underlight-read').onclick=()=>underLightAction();$('underlight-apply').onclick=()=>underLightAction(true);
$('lighting-direction-apply').onclick=async()=>{
 if(busy||!lightingModeReady||!lightingState?.canEditDirection||Number($('lighting-mode').value)!==lightingState.mode)return;
 const request={mode:lightingState.mode,reverse:$('lighting-reverse').checked};setBusy(true);
 $('lighting-mode-status').textContent='Applying direction and verifying device settings...';
 try{const reply=await window.keyboard.setBackLightDirection(request);if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent='Direction applied; configuration readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)lightingModeReady=false;if(applied){try{await readLightingMode();}catch{}}$('lighting-mode-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('lighting-speed-apply').onclick=async()=>{
 if(busy||!lightingModeReady||!lightingState?.canEditSpeed||Number($('lighting-mode').value)!==lightingState.mode)return;
 const percent=$('lighting-speed').valueAsNumber;
 const {speedMinimum:min,speedMaximum:max}=lightingState;
 if(!Number.isInteger(percent)||percent<0||percent>100){$('lighting-mode-status').textContent='Choose a speed from 0 to 100%.';return;}
 const speed=percentToSpeedUI(percent,min,max);
 setBusy(true);$('lighting-mode-status').textContent='Applying speed and verifying device settings...';
 try{const reply=await window.keyboard.setBackLightSpeed({mode:lightingState.mode,speed});if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent=lightingState?.speed!==speed?`Speed was not applied (keyboard reports ${lightingState?.speed??'unknown'}).`:'Speed applied; configuration readback verified. Saved to device memory automatically.';}
 catch(error){const applied=appliedWithoutSave(error);if(!applied)lightingModeReady=false;if(applied){try{await readLightingMode();}catch{}}$('lighting-mode-status').textContent=error.message;}
 finally{setBusy(false);}
};
$('lighting-mode').onchange=()=>{lightingCustomRgbPending=false;lightingSpeedDraft=null;updateLightingControls();updateLightingPreview();};$('lighting-custom-rgb').onchange=()=>{lightingCustomRgbPending=true;updateLightingControls();updateLightingPreview();};
for(const id of ['lighting-color','underlight-color'])$(id)?.addEventListener('input',()=>updateLightingPreview());
$('lighting-color-apply').onclick=async()=>{
 if(busy||!lightingModeReady||!lightingState?.canEditColor||Number($('lighting-mode').value)!==lightingState.mode)return;
 const request={mode:lightingState.mode,customRgb:lightingState.supportsCustomRgb?($('lighting-custom-rgb').closest('label').hidden?true:$('lighting-custom-rgb').checked):false,color:$('lighting-color').value};setBusy(true);
 $('lighting-mode-status').textContent='Applying color and verifying device settings...';
 try{const reply=await window.keyboard.setBackLightColor(request);if(!reply.ok)throw Error(reply.error);await readLightingMode();lightingCustomRgbPending=false;if(lightingState)$('lighting-custom-rgb').checked=!!lightingState.customRgb;$('lighting-mode-status').textContent=request.customRgb&&lightingState&&!lightingState.customRgb?'Color applied, but the keyboard reported Custom RGB off.':'Color applied; configuration readback verified. Saved to device memory automatically.';}
 catch(error){lightingCustomRgbPending=false;const applied=appliedWithoutSave(error);if(!applied)lightingModeReady=false;if(applied){try{await readLightingMode();}catch{}}$('lighting-mode-status').textContent=error.message;}
 finally{setBusy(false);}
};
async function readLightingMode(){
 lightingModeReady=false;
 const reply=await window.keyboard.readBackLight();if(!reply.ok)throw Error(reply.error);
 const state=reply.result;lightingState=state;lightingSpeedDraft=null;$('backlight-enabled').checked=state.enabled;
 $('lighting-speed').min=0;$('lighting-speed').max=100;$('lighting-speed').value=state.canEditSpeed?speedToPercentUI(state.speed,state.speedMinimum,state.speedMaximum):'';updateLightingSlider('lighting-speed','lighting-speed-value');
 $('lighting-reverse').checked=!!state.reverse;
 $('lighting-speed-note').textContent=state.canEditSpeed?'':'This effect has no speed control.';
 $('lighting-speed').closest('.lighting-section')?.classList.toggle('no-speed',!state.canEditSpeed);
 if(!lightingCustomRgbPending)$('lighting-custom-rgb').checked=!!state.customRgb;$('lighting-color').value=state.color||'#000000'; $('lighting-color-note').textContent=state.mode===6?'Star uses its own blue palette with colored accents.':state.canEditColor?'The selected color is applied directly. Single Light can override Back Light on assigned keys.':'This effect has no custom color control.';
 lightingModeReady=state.canSwitch;$('lighting-mode').value=state.canSwitch?String(state.mode):'';
 $('lighting-mode-status').textContent=state.canSwitch?'':'Switching from this effect is in development; select a supported Back Light effect in MMPanel first.';
 updateLightingPreview();
}
$('lighting-mode-apply').onclick=async()=>{
 if(busy||!lightingModeReady)return;
 const mode=Number($('lighting-mode').value);setBusy(true);
 $('lighting-mode-status').textContent='Applying effect and verifying device settings...';
 try{const reply=await window.keyboard.setBackLightMode(mode);if(!reply.ok)throw Error(reply.error);await readLightingMode();$('lighting-mode-status').textContent='Effect applied; configuration readback verified. Saved to device memory automatically.';}
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
 try{const reply=apply?await window.keyboard.setBrightness(value):await window.keyboard.readBrightness();if(!reply.ok)throw Error(reply.error);lightingSavedBrightness=reply.result.brightness;$('lighting-brightness').value=Math.round(lightingSavedBrightness*100/255);updateLightingSlider('lighting-brightness','lighting-brightness-value');success=true;$('lighting-status').textContent=apply?'Brightness applied; device readback verified.':'';try{await readLightingMode();}catch(error){$('lighting-mode-status').textContent=error.message;}try{await readUnderLight();}catch(error){$('underlight-status').textContent=error.message;}try{await readSingleLight();}catch(error){$('single-status').textContent=error.message;}}
 catch(error){$('lighting-status').textContent=error.message;}
 finally{lightingBrightnessReady=success;setBusy(false);$('lighting-read').disabled=false;}
}
$('lighting-read').onclick=()=>lightingBrightness();$('lighting-apply').onclick=()=>lightingBrightness(true);
['lighting-brightness','lighting-speed','underlight-speed','underlight-brightness'].forEach(id=>$(id)?.addEventListener('input',()=>updateLightingSlider(id,`${id}-value`)));
$('lighting-speed').addEventListener('input',()=>{if(lightingState?.canEditSpeed){lightingSpeedDraft=percentToSpeedUI($('lighting-speed').valueAsNumber,lightingState.speedMinimum,lightingState.speedMaximum);updateLightingPreview();}});
$('underlight-speed').addEventListener('input',()=>{if(underLightState?.canEditSpeed){underSpeedDraft=percentToSpeedUI($('underlight-speed').valueAsNumber,underLightState.speedMinimum,underLightState.speedMaximum);updateLightingPreview();}});
$('lighting-speed-value').style.display='none';$('underlight-speed-value').style.display='none';
$('lighting-speed').closest('.lighting-section')?.classList.add('speed-section');$('underlight-speed').closest('.lighting-section')?.classList.add('speed-section');
const remapPanel=document.createElement('section');remapPanel.className='panel';remapPanel.hidden=true;
remapPanel.innerHTML='<small>PROGRAMMING</small><h2>Remap</h2><p>Assign one physical switch to another standard keyboard action. The source must be in Standard mode.</p><div class="controls"><label>Source switch<select id="remap-source"></select></label><label>Target action<select id="remap-target"></select></label></div><p id="remap-current"></p><div class="actions"><button id="remap-apply">Apply remap</button><span id="remap-status" role="status"></span></div><hr><h2>Layer assignment</h2><p>Assign FN1, FN2 or FN3, as in MMPanel.</p><div class="controls"><label>Source switch<select id="layer-source"></select></label><label>Target layer<select id="layer-target"><option value="0">FN1</option><option value="1">FN2</option><option value="2">FN3</option></select></label></div><p id="layer-current"></p><div class="actions"><button id="layer-apply">Apply FN</button><button id="layer-standard" disabled>Return to standard</button><span id="layer-standard-note"></span><span id="layer-status" role="status" aria-live="polite"></span></div><hr><h2>Media</h2><p>Choose or change a media or editing action.</p><div class="controls"><label>Source switch<select id="media-source"></select></label><label>Action<select id="media-action"></select></label></div><p id="media-current"></p><div class="actions"><button id="media-apply">Apply Media</button><button id="media-standard" disabled>Return to standard</button><span id="media-standard-note"></span><span id="media-status" role="status" aria-live="polite"></span></div>';
pendingPanel.after(remapPanel);
remapPanel.insertAdjacentHTML('beforeend','<hr><h2>Modify</h2><div class="modify-editor"><div id="modify-keyboard-panel" hidden></div><div id="modify-mouse-panel" hidden><div class="modify-mouse-grid">'+Object.entries(window.M6_MOUSE_ACTIONS||{}).filter(([id])=>['left-button','right-button','middle-button','wheel-up','wheel-down'].includes(id)).map(([id,action])=>'<button type="button" class="modify-mouse-key" data-mouse-action="'+id+'" title="'+action.label+'" aria-label="'+action.label+'">'+(window.M6_MOUSE_SVG?.[id]||'ðŸ–±')+'<span>'+action.label+'</span></button>').join('')+'</div></div><div class="modify-hotkey-row"><label class="hotkey-toggle"><span>HotKey</span><input id="modify-hotkey" type="checkbox"></label><span class="hotkey-interval">Interval <output id="modify-interval-value">23</output></span></div><div class="modify-hidden-fields"><select id="modify-type" hidden><option value="0">Keyboard</option><option value="1">Mouse</option></select><select id="modify-source"></select><select id="modify-target"></select><input id="modify-button" type="number" value="0"><input id="modify-x" type="number" value="0"><input id="modify-y" type="number" value="0"><input id="modify-wheel" type="number" value="0"><input id="modify-mode" type="number" value="0"></div><p id="modify-current"></p><div class="actions"><button id="modify-apply">Apply</button><span id="modify-status" role="status" aria-live="polite"></span></div></div>');
function fillHotKey(){if(!programming||!profile)return;const select=$('hotkey-source'),previous=select.value||selectedId;select.replaceChildren();for(const key of profile.layout){const option=document.createElement('option');option.value=key.id;option.textContent=`${key.label||'Space'} (${key.row+1}:${key.col+1})`;select.appendChild(option);}select.value=previous;updateHotKey();}
function updateHotKey(){if(!programming)return;const [row,col]=$('hotkey-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);if(!key)return;$('hotkey-interval').value=key.hotKey?.interval??23;$('hotkey-current').textContent=`Current mode: ${key.mode===0?'Standard':`Mode ${key.mode}`}. HotKey type: ${key.hotKey?.type??0}, interval: ${key.hotKey?.interval??0}.`;$('hotkey-apply').disabled=busy||key.mode!==0;}
$('hotkey-source').onchange=updateHotKey;$('hotkey-apply').onclick=async()=>{if(busy||!programming)return;setBusy(true);$('hotkey-status').textContent='Applying and verifying HotKey...';try{const reply=await window.keyboard.setHotKey({layer,id:$('hotkey-source').value,interval:$('hotkey-interval').valueAsNumber});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillHotKey();$('hotkey-status').textContent='HotKey applied and verified by readback.';}catch(e){$('hotkey-status').textContent=e.message;}finally{setBusy(false);updateHotKey();}};
function fillRemap(){if(!profile)return;const source=profile.layout.map(k=>`<option value="${k.id}">${k.label||k.id}</option>`).join(''),targets=(window.M6_FULL_SIZE_KEYBOARD||[]).flatMap((row,r)=>row.map((label,c)=>label?`<option value="key:${r}:${c}">${label}</option>`:'')).join('');$('remap-source').innerHTML=source;$('remap-target').innerHTML='<option value="">—</option>'+targets;$('remap-source').value=selectedId;updateRemapState();}
remapPanel.insertAdjacentHTML('beforeend','<hr><h2>Off / Enable key</h2><p>Off disables the source switch selected above. Available for Standard, Media, FN, DKS, Snap Tap and SOCD assignments. The saved assignment is retained.</p><label><input id="key-enabled" type="checkbox"> Enable selected key</label><button id="key-enabled-apply">Apply key state</button><p id="key-enabled-status" role="status"></p>');
$('key-enabled-apply').onclick=async()=>{
 if(busy||!programming)return;
 const request={layer,id:$('remap-source').value,enabled:$('key-enabled').checked};
 setBusy(true);$('key-enabled-apply').disabled=true;
 try{const reply=await window.keyboard.setKeyEnabled(request);if(!reply.ok)throw new Error(reply.error);programming=reply.result;showPairState();showDksState();$('key-enabled-status').textContent=(request.enabled?'Key enabled.':'Key disabled.')+' Configuration readback verified. Saved to device memory automatically.';}
 catch(e){$('key-enabled-status').textContent=e.message;}
 finally{setBusy(false);updateRemapState();}
};
function updateRemapState(){if(!programming)return;const [row,col]=$('remap-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);$('key-enabled').checked=key?.locked===0;$('key-enabled').disabled=busy||!key||![0,2,3,4,5,6].includes(key.mode);$('key-enabled-apply').disabled=busy||!key||![0,2,3,4,5,6].includes(key.mode);const target=key&&key.modify&&key.modify.type===0&&(key.modify.row!==key.row+1||key.modify.col!==key.col)?`key:${key.modify.row-1}:${key.modify.col}`:null;$('remap-target').value=target||'';$('remap-current').textContent=key?`Current mode: ${key.mode===0?'Standard':key.mode===2?'Media':key.mode===3?'FN/layer':key.mode===4?'DKS':key.mode===5?'Snap Tap':key.mode===6?'SOCD / AD Cancel':'Unsupported mode '+key.mode}.${target?' Target: '+fullSizeTargetLabel(key.modify.row-1,key.modify.col)+'.':''}` :'';$('remap-apply').disabled=busy||!key||key.mode!==0||!$('remap-target').value||$('remap-target').value===$('remap-source').value;if(typeof syncKeyLibrary==='function')syncKeyLibrary();updateProgrammingIndicators();}
 $('remap-source').onchange=()=>{updateRemapState();updateModifyState();};$('remap-target').onchange=()=>{if(typeof syncKeyLibrary==='function')syncKeyLibrary();};$('remap-apply').onclick=async()=>{if(busy||!programming)return;const source=$('remap-source').value,target=$('remap-target').value;if(source===target)return;setBusy(true);$('remap-status').textContent='Applying and verifying remap...';try{const reply=await window.keyboard.setRemap({layer,source,target});if(!reply.ok)throw new Error(reply.error);programming=reply.result;updateRemapState();$('remap-status').textContent='Remap applied and verified by readback.';}catch(e){$('remap-status').textContent=e.message;}finally{setBusy(false);updateRemapState();}};
remapPanel.insertAdjacentHTML('beforeend','<div class="actions"><button id="programming-reset" class="secondary">Reset selected key to Standard</button><span id="programming-reset-status" role="status"></span></div>');
$('programming-reset').onclick=async()=>{if(busy||!programming)return;setBusy(true);$('programming-reset-status').textContent='Resetting and verifying...';try{const reply=await window.keyboard.resetProgrammingKey({layer,id:$('remap-source').value});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillRemap();fillLayer();fillMedia();fillModify();fillHotKey();showPairState();showDksState();const partners=(reply.result.remainingPairSources||[]).map(k=>profile.layout.find(p=>p.id===k.id)?.label||k.id);$('programming-reset-status').textContent='Selected key reset and verified.'+(partners.length?' Remaining Snap/SOCD assignments pointing to this key: '+partners.join(', ')+'. Use Disable pair to clear both assignments.':'');}catch(e){$('programming-reset-status').textContent=e.message;}finally{setBusy(false);updateRemapState();}};
function fillModify(){
 if(!profile||!programming)return;
 const source=$('modify-source'),target=$('modify-target'),previous=source.value||selectedId;
 source.replaceChildren();for(const key of profile.layout){const option=document.createElement('option');option.value=key.id;option.textContent=`${key.label||'Space'} (${key.row+1}:${key.col+1})`;source.appendChild(option);}
 target.replaceChildren();for(const [r,row] of (window.M6_FULL_SIZE_KEYBOARD||[]).entries())for(const [c,label] of row.entries())if(label){const option=document.createElement('option');option.value=`key:${r}:${c}`;option.textContent=label;target.appendChild(option);}
 source.value=previous;updateModifyState();
}
function mouseActionFor(m){return Object.entries(window.M6_MOUSE_ACTIONS||{}).find(([,action])=>action.button===(m.button||0)&&action.x===(m.x||0)&&action.y===(m.y||0)&&action.wheel===(m.wheel||0))?.[0]||null;}
function updateModifyState(){
 if(!programming){$('modify-apply').disabled=true;$('modify-hotkey').disabled=true;return;}
 const [row,col]=$('modify-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);if(!key){$('modify-apply').disabled=true;$('modify-hotkey').disabled=true;return;}
 const m=key.modify||{},type=m.type||0,remapped=type===0&&m.mode!==2&&m.row>=1&&(m.row!==key.row+1||m.col!==key.col),target=`key:${remapped?m.row-1:key.row}:${remapped?m.col:key.col}`;
 $('modify-type').value=String(type);$('modify-target').value=target;$('modify-button').value=m.button||0;$('modify-x').value=m.x||0;$('modify-y').value=m.y||0;$('modify-wheel').value=m.wheel||0;$('modify-mode').value=m.mode||0;$('modify-hotkey').checked=m.mode===2;$('modify-interval-value').textContent='23';
 for(const button of remapPanel.querySelectorAll('[data-modify-type]'))button.setAttribute('aria-pressed',String(Number(button.dataset.modifyType)===type));
 $('modify-keyboard-panel').hidden=type===1;$('modify-mouse-panel').hidden=type!==1;const mouse=mouseActionFor(m);for(const button of remapPanel.querySelectorAll('[data-mouse-action]'))button.classList.toggle('selected',button.dataset.mouseAction===mouse);
 const label=type===1?(window.M6_MOUSE_ACTIONS?.[mouse]?.label||'Mouse action'):fullSizeTargetLabel((m.row||1)-1,m.col||0);
 $('modify-current').textContent=`${type===1?'Mouse':'Keyboard'}: ${label}${m.mode===2?` - HotKey ${m.interval||0}`:''}.`;
 $('modify-apply').disabled=busy||key.mode!==0;$('modify-hotkey').disabled=busy||key.mode!==0;
 updateProgrammingIndicators();
}
$('modify-source').onchange=updateModifyState;
for(const button of remapPanel.querySelectorAll('[data-modify-type]'))button.onclick=()=>{$('modify-type').value=button.dataset.modifyType;updateModifyState();};
for(const button of remapPanel.querySelectorAll('[data-mouse-action]'))button.onclick=()=>{const action=window.M6_MOUSE_ACTIONS?.[button.dataset.mouseAction];if(!action)return;$('modify-type').value='1';$('modify-button').value=action.button;$('modify-x').value=action.x;$('modify-y').value=action.y;$('modify-wheel').value=action.wheel;updateModifyState();};
 $('modify-apply').onclick=async()=>{if(busy||!programming)return;const type=Number($('modify-type').value),parts=$('modify-target').value.split(':').slice(1).map(Number),wantHotKey=$('modify-hotkey').checked,modify={type,row:parts[0],col:parts[1],button:Number($('modify-button').value),x:Number($('modify-x').value),y:Number($('modify-y').value),wheel:Number($('modify-wheel').value),mode:wantHotKey?2:0,interval:wantHotKey?23:0};setBusy(true);$('modify-status').textContent='Applying and verifying...';try{const reply=await window.keyboard.setModify({layer,id:$('modify-source').value,modify});if(!reply.ok)throw new Error(reply.error);programming=reply.result;const appliedKey=reply.result.keys.find(k=>`${k.row}:${k.col}`===$('modify-source').value);if(wantHotKey&&appliedKey?.modify?.mode!==2)throw new Error(`HotKey was not applied by the keyboard (readback mode ${appliedKey?.modify?.mode??'unknown'}).`);if(!wantHotKey&&appliedKey?.modify?.mode===2)throw new Error('HotKey was not removed by the keyboard.');fillModify();$('modify-status').textContent='Applied and verified by readback.';}catch(e){$('modify-status').textContent=e.message;}finally{setBusy(false);updateModifyState();}};
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
function updateLayerState(){if(!programming)return;const [row,col]=$('layer-source').value.split(':').map(Number),key=programming.keys.find(k=>k.row===row&&k.col===col);if(!key)return;$('layer-current').textContent=`Current mode: ${key.mode===0?'Standard':key.mode===3?'Layer':'Mode '+key.mode}. Assigned layer: ${[0,1,2].includes(key.layer?.layer)?'FN'+(key.layer.layer+1):'None'}.`;$('layer-target').value=String([0,1,2].includes(key.layer?.layer)?key.layer.layer:0);$('layer-apply').disabled=busy||![0,3].includes(key.mode);updateStandardReturn('layer',key);updateProgrammingIndicators();}
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
 $('media-apply').disabled=busy||![0,2].includes(key.mode)||!select.value;updateStandardReturn('media',key);updateProgrammingIndicators();
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
calibrationPanel.innerHTML='<small>HALL EFFECT</small><h2>Calibration</h2><p>Read the saved sensor ranges for every switch. Reading creates a local backup and preserves the current calibration.</p><button id="calibration-read">Refresh calibration</button><button id="calibration-reset" class="secondary">Reset all calibration</button><button id="calibration-start">Calibrate all</button><button id="calibration-selected">Calibrate selected key</button><button id="calibration-finish" hidden>Finish</button><button id="calibration-cancel" class="secondary" hidden>Cancel</button><p id="calibration-status" role="status" aria-live="polite">Not read yet.</p><p id="calibration-live" class="calibration-live" role="status" aria-live="polite"></p><p id="calibration-read-status" class="calibration-read-status">No successful read yet.</p><p>OK = a saved working sensor range. Not calibrated = factory/reset baseline 2000 / 2200. Error = an unexpected range. Empty = both values are zero.</p><p><strong>Reset all calibration</strong> restores every saved sensor range to 2000 / 2200. A backup is created before the reset. This operation cannot be undone automatically.</p><p><strong>Selected-key flow:</strong> tap a switch above, choose Calibrate selected key, press only that switch, choose Finish, then confirm the vendor save prompt. The keyboard may reconnect.</p>';
pendingPanel.after(calibrationPanel);
const calibrationMap=document.createElement('div');calibrationMap.id='calibration-map';calibrationMap.className='keyboard';calibrationMap.setAttribute('aria-label','Saved switch calibration');calibrationMap.hidden=true;$('keyboard').after(calibrationMap);
let calibrationActive=false,calibrationStateKnown=false,calibrationPoll=null,calibrationLiveBaseline=null,calibrationSelectedIds=new Set();
let calibrationPollBusy=false,calibrationPollGeneration=0,calibrationReadCount=0,calibrationPreviousRanges=null;
function stopCalibrationPoll(){calibrationPollGeneration++;if(calibrationPoll){clearTimeout(calibrationPoll);calibrationPoll=null;}}
function startCalibrationPoll(){
  stopCalibrationPoll();const generation=calibrationPollGeneration;
  const tick=async()=>{
    if(!calibrationActive||generation!==calibrationPollGeneration)return;
    if(busy||calibrationPollBusy){calibrationPoll=setTimeout(tick,750);return;}
    calibrationPollBusy=true;
    try{await refreshCalibration(true,generation);}
    catch(error){if(generation===calibrationPollGeneration){const read=$('calibration-read-status');if(read)read.textContent=`Read failed: ${error.message}. Displayed values are from the last successful read.`;}}
    finally{calibrationPollBusy=false;if(calibrationActive&&generation===calibrationPollGeneration)calibrationPoll=setTimeout(tick,750);}
  };
  tick();
}
function setCalibrationActive(value){calibrationActive=value;if(value)calibrationLiveBaseline=null;$('calibration-start').hidden=value;$('calibration-selected').hidden=value;$('calibration-finish').hidden=!value;$('calibration-cancel').hidden=!value;$('calibration-reset').disabled=value||!calibrationStateKnown;const live=$('calibration-live');if(live){live.classList.toggle('active',value);if(!value)live.textContent='';}}
function updateSelectedCalibrationButton(){
  const calibrationCount=calibrationSelectedIds.size;
  $('calibration-selected').textContent=calibrationCount>1?'Calibrate selected keys':'Calibrate selected key';
  $('calibration-selected').disabled=busy||!calibrationStateKnown||calibrationActive||!calibrationCount;
  const calibrationId=[...calibrationSelectedIds][0];
  $('calibration-selected').title=calibrationCount>1?`Calibrate ${calibrationCount} selected switches`:(calibrationCount===1?`Calibrate ${profile?.layout.find(k=>k.id===calibrationId)?.label||calibrationId}`:'Select one or more switches first');
  $('calibration-start').disabled=busy||!calibrationStateKnown||calibrationActive;
  $('calibration-reset').disabled=busy||!calibrationStateKnown||calibrationActive;
  $('calibration-finish').disabled=busy||!calibrationStateKnown||!calibrationActive;
  $('calibration-cancel').disabled=busy||!calibrationStateKnown||!calibrationActive;
}
async function restoreCalibrationState(){
  calibrationStateKnown=false;updateSelectedCalibrationButton();
  if(typeof stopCalibrationPoll==='function')stopCalibrationPoll();
  try{
    const reply=await window.keyboard.calibrationState();
    if(!reply.ok)throw new Error(reply.error);
    calibrationSelectedIds=reply.result.active?new Set(reply.result.selectedIds||(reply.result.selectedId?[reply.result.selectedId]:[])):new Set();
    setCalibrationActive(reply.result.active);
    calibrationStateKnown=true;
    updateSelectedCalibrationButton();
    if(reply.result.recoveryError){
      $('calibration-status').textContent='Previous calibration session could not be recovered: '+reply.result.recoveryError+'. Existing backups were retained. Refresh calibration to inspect current ranges.';
    }else if(reply.result.phase==='interrupted'){
      $('calibration-status').textContent='An interrupted calibration session was recovered. Device calibration state is unknown. Refresh calibration to compare saved ranges with the retained backup. No command was sent automatically.';
    }
    if(reply.result.active){
      const names=[...calibrationSelectedIds].map(id=>profile?.layout.find(k=>k.id===id)?.label||id);
      $('calibration-status').textContent='An active calibration session was restored.'+(names.length?` Press only ${names.join(', ')}.`:'')+' Choose Finish or Cancel when ready.';
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
      $('calibration-status').textContent='Calibration started. Reading saved ranges and listening for live calibration telemetry. Press switches in any order, then choose Finish.';if(typeof startCalibrationPoll==='function')startCalibrationPoll();
    }else if(command===2){
      if(typeof stopCalibrationPoll==='function')stopCalibrationPoll();
      setCalibrationActive(false);
      $('calibration-status').textContent='Finish command sent. Keyboard is restarting; reloading in 8 seconds...';
      setTimeout(()=>window.location.reload(),8000);
    }else{
      if(typeof stopCalibrationPoll==='function')stopCalibrationPoll();
      await new Promise(r=>setTimeout(r,1500));
      await readCalibrationAfterReconnect();
      $('calibration-status').textContent='Cancel command sent. '+$('calibration-status').textContent;
    }
  }catch(error){$('calibration-status').textContent=error.message;}
  finally{setBusy(false);}
}
async function cancelCalibrationOnExit(){
  if(!calibrationActive)return;
  if(typeof stopCalibrationPoll==='function')stopCalibrationPoll();
  setCalibrationActive(false);
  try{await window.keyboard.calibrationCommand(3);}catch{}
}
window.cancelCalibrationOnExit=cancelCalibrationOnExit;
$('calibration-start').onclick=()=>calibrationCommand(1);
$('calibration-reset').onclick=async()=>{
  if(busy||!calibrationStateKnown||calibrationActive)return;
  const prompt='Reset calibration values for all keys?\n\nAll saved sensor ranges will be replaced with the 2000 / 2200 baseline. A backup will be kept, but automatic undo is unavailable.';
  if(!window.confirm(prompt))return;
  setBusy(true);$('calibration-status').textContent='Resetting all calibration values...';
  try{
    const reply=await window.keyboard.resetCalibration();
    if(!reply.ok)throw new Error(reply.error);
    await refreshCalibration();
    $('calibration-status').textContent=`Calibration reset verified for ${reply.result.resetCount} records. Backup: ${reply.result.backup}`;
  }catch(error){$('calibration-status').textContent=error.message;}
  finally{setBusy(false);updateSelectedCalibrationButton();}
};
$('calibration-selected').onclick=async()=>{
  const ids=[...calibrationSelectedIds];
  if(busy||!calibrationStateKnown||calibrationActive||!ids.length)return;
  const names=ids.map(id=>profile?.layout.find(k=>k.id===id)?.label||id);
  setBusy(true);$('calibration-status').textContent=`Starting calibration for ${names.join(', ')}...`;
  try{
    const reply=await window.keyboard.calibrateSelectedKeys(ids);
    if(!reply.ok)throw new Error(reply.error);
    setCalibrationActive(true);
    $('calibration-status').textContent=ids.length===1?`Selected-key calibration started for ${names[0]}. Live telemetry will mark received values; press only this key, then choose Finish.`:`Calibration started for ${ids.length} switches: ${names.join(', ')}. Live telemetry will mark received values; press only the selected switches, then choose Finish.`;
    startCalibrationPoll();
  }catch(error){$('calibration-status').textContent=error.message;}
  finally{setBusy(false);updateSelectedCalibrationButton();}
};
$('calibration-finish').onclick=()=>{
  const prompt='Calibration finished, save calibration values?\n\nSaved values will automatically restart the keyboard.';
  if(window.confirm(prompt))calibrationCommand(2);
};
$('calibration-cancel').onclick=()=>calibrationCommand(3);
async function refreshCalibration(silent=false,generation){
    const reply=await window.keyboard.readCalibration();
    if(generation!==undefined&&generation!==calibrationPollGeneration)return;
    if(!reply.ok)throw new Error(reply.error);
    const data=reply.result;
    const displayRecord=physical=>{const stored=data.records[physical.row*14+physical.col],live=data.live?.active?data.live.records?.[physical.id]:null;return {stored,liveRecord:live,record:live||stored,pending:data.live?.active&&!live};};
    const changedIds=new Set(),changeInfo=new Map();
    if(calibrationActive){
      if(!calibrationLiveBaseline)calibrationLiveBaseline=new Map();
      for(const physical of data.layout){
        const {stored,liveRecord,record}=displayRecord(physical);if(!record)continue;
        if(liveRecord&&(liveRecord.min!==stored.min||liveRecord.max!==stored.max)){changedIds.add(physical.id);if(!changeInfo.has(physical.id))changeInfo.set(physical.id,stored);}
        const previous=calibrationLiveBaseline.get(physical.id);
        if(!previous)calibrationLiveBaseline.set(physical.id,{min:record.min,max:record.max});
        else if(previous.min!==record.min||previous.max!==record.max){changedIds.add(physical.id);changeInfo.set(physical.id,previous);}
      }
      for(const change of data.comparison?.changedKeys||[]){changedIds.add(change.id);if(!changeInfo.has(change.id))changeInfo.set(change.id,change.before);}
    }
    const fragment=document.createDocumentFragment();
    for(const physical of data.layout){
      const {stored,liveRecord,record,pending}=displayRecord(physical);
      const changed=calibrationActive&&changedIds.has(physical.id),previous=changed?changeInfo.get(physical.id):null;
      const key=document.createElement('button');key.type='button';key.className='calibration-key';key.dataset.id=physical.id;key.dataset.state=pending?'pending':record.rangeStatus;
      if(calibrationSelectedIds.has(physical.id))key.classList.add('chosen');
      if(changed)key.classList.add('changed');
      key.style.left=`${3+physical.x/680*94}%`;key.style.top=`${18+physical.y*1.65}px`;key.style.width=`${physical.width/680*94}%`;
      const stateLabel=liveRecord?(liveRecord.rangeStatus==='ok'?'OK - live':liveRecord.rangeStatus):pending?'Pending':stored.rangeStatus==='ok'?'OK':stored.rangeStatus;
      const values=liveRecord?`${liveRecord.min} / ${liveRecord.max}`:`${stored.min} / ${stored.max}${pending?' - stored':''}`;
      for(const value of [physical.label||'Space',stateLabel,values]){const label=document.createElement('span');label.textContent=value;key.appendChild(label);}
      key.title=liveRecord?`${physical.label}: live sensor min ${liveRecord.min}, max ${liveRecord.max}`:`${physical.label}: stored sensor min ${stored.min}, max ${stored.max}${pending?' (no live measurement received yet)':''}${previous?` - was ${previous.min} / ${previous.max}`:''}. Tap to select for single-switch calibration.`;
      key.onclick=()=>selectCalibrationKey(physical.id);
      fragment.appendChild(key);
    }
    $('calibration-map').replaceChildren(fragment);
    const ranges=new Map(data.layout.map(physical=>{const {record}=displayRecord(physical);return [physical.id,`${record.min}/${record.max}`];}));
    const changed=calibrationPreviousRanges?[...ranges].filter(([id,value])=>calibrationPreviousRanges.get(id)!==value).length:null;
    calibrationPreviousRanges=ranges;calibrationReadCount++;
    const telemetryDetail=data.live?.active?` Frames: ${data.live.frames??0}${data.live.rejected?`, rejected: ${data.live.rejected}`:''}${data.live.error?`, error: ${data.live.error}`:''}.`:'';
    const liveStatus=data.live?.active?(data.live.available?` Live calibration telemetry: ${data.live.count}/${data.layout.length} switches. Values marked (live); remaining values are stored.${telemetryDetail}`:` Live telemetry not observed yet; values shown are stored and remaining switches are Pending.${telemetryDetail}`):'';
    $('calibration-read-status').textContent=`Updated: ${data.readAt}. Successful reads: ${calibrationReadCount}. ${changed===null?'First reading.':`Ranges changed since previous read: ${changed}/${data.layout.length}.`}${liveStatus}${data.live?.active?'':' Updated confirms a successful read, not a new calibration measurement.'}`;
    const live=$('calibration-live');
    if(live&&calibrationActive){const d=data.live,stamp=new Date().toLocaleTimeString();live.textContent=(d?.active?(d.available?`LIVE - ${d.count}/${data.layout.length} switches - frames ${d.frames??0}${d.rejected?` - rejected ${d.rejected}`:''}`:'LIVE - telemetry not observed yet'):'LIVE - waiting for telemetry')+` - updated ${stamp}`;}
    const summary=Object.entries(data.statusSummary||{}).map(([name,count])=>`${name}: ${count}`).join(' ? ');
    if(!silent)$('calibration-status').textContent=`Read ${data.layout.length} switches${summary?` ? ${summary}`:''}. Backup: ${data.backup}`;
    if(data.comparison){
      const result=data.comparison;
      const names=result.changedKeys.map(k=>k.label||k.id).join(', ')||'none';
      const cancel=result.cancelVerified===true?' Cancel verified: saved calibration unchanged.':result.cancelVerified===false?' Cancel verification failed: saved calibration differs from the backup.':'';
      if(!silent)$('calibration-status').textContent+=` Changed switches: ${names}. Unchanged: ${result.unchangedKeyCount}/${data.layout.length}. Other changed records: ${result.hiddenRecordChanges}.${cancel}`;
      if(!silent&&result.selectedScope){
        const scope=result.selectedScope,scopeLabel=scope.ids?.length>1?`${scope.ids.length} selected ranges`:'the selected range';
        $('calibration-status').textContent+=scope.verified?` Calibration verified: only ${scopeLabel} changed; all other records are unchanged.`:!scope.otherRecordsUnchanged?' Calibration isolation failed: other calibration records changed. See the comparison report.':!scope.selectedChanged?` ${scopeLabel} did not change; a new calibration result is not verified.`:' Calibration is not yet verified.';
        $('calibration-status').textContent+=' Report: '+result.report;
      }
    }
}
function selectCalibrationKey(id){
  if(busy)return;
  if(calibrationSelectedIds.has(id))calibrationSelectedIds.delete(id);else calibrationSelectedIds.add(id);
  selectedId=[...calibrationSelectedIds].pop()||'';
  selectedIds=new Set(calibrationSelectedIds);
  if(selectedId)showSelected();else refreshSelection();
  for(const key of $('calibration-map').querySelectorAll('.calibration-key'))key.classList.toggle('chosen',calibrationSelectedIds.has(key.dataset.id));
  const count=calibrationSelectedIds.size;
  if(!count)$('calibration-status').textContent='Tap one or more switches to select them for calibration.';
  else if(count===1){const physical=profile?.layout.find(k=>k.id===selectedId);$('calibration-status').textContent=`${physical?.label||selectedId} selected. Choose Calibrate selected key.`;}
  else $('calibration-status').textContent=`${count} switches selected. Choose Calibrate selected keys.`;
  updateSelectedCalibrationButton();
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
selectionBar.innerHTML='<button id="select-multiple" class="secondary" aria-pressed="false">Select multiple</button><button id="select-all-keys" class="secondary">Select all keys</button><button id="select-one-key" class="secondary">Keep one key</button><span id="selection-summary"></span><p>Click to select a switch. Use Select multiple or Ctrl / Command + click to add switches. Changes write automatically to the selected group.</p>';
$('keyboard').after(selectionBar);
function refreshSelection(){
  const selectable=document.body.dataset.page!=='home';
  document.querySelectorAll('.key').forEach(b=>{const selected=selectable&&selectedIds.has(b.dataset.id);b.classList.toggle('chosen',selected);b.setAttribute('aria-pressed',String(selected));});
  $('selection-summary').textContent=`${selectedIds.size} switch${selectedIds.size===1?'':'es'} selected`;
  syncSingleSelection();
  updateSelectedCalibrationButton();
  $('save').textContent=selectedIds.size>1?`Apply (${selectedIds.size} keys)`:'Apply';
  $('save').title='Apply the displayed mode and its values to the selected switches';
}
// Keeps the Single Light key list in step with the keyboard selection so that a
// color picked for the highlighted switches applies to exactly those switches.
function syncSingleSelection(){
  const select=$('single-keys');if(!singleReady||!select.options.length)return;
  let changed=false;
  for(const option of select.options){const wanted=selectedIds.has(option.value);if(option.selected!==wanted){option.selected=wanted;changed=true;}}
  if(changed)showSingleSelection();
}
$('select-multiple').onclick=()=>{multipleSelection=!multipleSelection;$('select-multiple').setAttribute('aria-pressed',String(multipleSelection));};
$('select-all-keys').onclick=()=>{if(busy||!profile)return;selectedIds=new Set(profile.layout.map(k=>k.id));selectedId=[...selectedIds][0];refreshSelection();collapseHeFields();};
$('select-one-key').onclick=()=>{if(busy||!profile||!ensureSelectedKey())return;selectedIds=new Set([selectedId]);refreshSelection();collapseHeFields();};
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
  $('preset-off').title='Restore W/A/S/D to Standard in the current profile; custom assignments are checked first';
  $('preset-defaults').title=$('preset-off').title;
  $('pair-apply').disabled=value||!programming;
  $('pair-disable').disabled=value||!programming;
  $('dks-apply').disabled=value||!programming;$('dks-disable').disabled=value||!programming;
  $('dks-preview-all').disabled=value||!programming;
  $('dks-wasd').disabled=value||!programming;$('dks-wasd-disable').disabled=value||!programming;
  $('snap-ad').disabled=value||!programming;$('snap-ad-disable').disabled=value||!programming;
  $('cl-ad').disabled=value||!programming;$('preset-defaults').disabled=value||!programming;
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
  $('programming-reset').disabled=value||!programming;if($('programming-reset-all'))$('programming-reset-all').disabled=value||!programming;
  $('device-fps').disabled=value||!deviceSettings?.canEditFps;
  $('device-mode-apply').disabled=value||!deviceSettings?.canEditPerformance;
 settingsPanel.querySelectorAll('[data-performance-mode]').forEach(button=>{button.disabled=value||!deviceSettings?.canEditPerformance;});
 updateSettingControls();
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
  updateHeFieldsVisibility();
  $('mode-mechanical').setAttribute('aria-pressed',String(!key.rtOn));$('mode-rt').setAttribute('aria-pressed',String(key.rtOn));
  const values=displayTravel(key);$('selected-release').textContent=values.release;$('selected-trigger').textContent=values.trigger;
  updateKeyValues();
  refreshSelection();
}
function displayTravel(key){return {trigger:(key.rtOn?key.trigger:key.fixedDown).toFixed(3),release:(key.rtOn?key.release:key.fixedUp).toFixed(3)};}
function updateHeFieldsVisibility(){const visible=heFieldsVisible&&!!selectedId&&!!profile;$('mechanical-fields').hidden=!visible||$('rt').checked;$('rt-fields').hidden=!visible||!$('rt').checked;const apply=$('apply-he');if(apply){apply.hidden=!visible;apply.style.display=visible?'':'none';}}
function collapseHeFields(){heFieldsVisible=false;updateHeFieldsVisibility();}
function ensureSelectedKey(){if(selectedId&&selectedIds.has(selectedId))return true;if(selectedIds.size){selectedId=[...selectedIds][0];return true;}return false;}
const keyStateSummary=document.createElement('p');keyStateSummary.id='key-state-summary';keyStateSummary.setAttribute('role','status');
$('keyboard').after(keyStateSummary);
function fullSizeTargetLabel(row,col){return window.M6_FULL_SIZE_KEYBOARD?.[row]?.[col]||`Key ${row+1}:${col+1}`;}
function programmingBadge(assignment){
 if(!assignment)return null;
 const labelFor=id=>profile?.layout.find(k=>k.id===id)?.label||id;
 if(assignment.mode===5)return {text:'SNAP',kind:'snap'};
 if(assignment.mode===6)return {text:'SOCD',kind:'snap'};
 if(assignment.mode===4){const d=assignment.dks||{};return {text:d.type===1?'DKS-MOUSE':d.row>0?`DKS→${fullSizeTargetLabel(d.row,d.col)}`:'DKS',kind:'dks'};}
 if(assignment.mode===3)return {text:[0,1,2].includes(assignment.layer?.layer)?`FN${assignment.layer.layer+1}`:'FN',kind:'fn'};
 if(assignment.mode===2)return {text:'MEDIA',kind:'media'};
 if(assignment.mode===0&&assignment.modify?.type===1)return {text:mouseActionFor(assignment.modify)||'MOUSE',kind:'remap'};
 if(assignment.mode===0&&assignment.modify?.type===0&&assignment.modify.row>=1&&(assignment.modify.row!==assignment.row+1||assignment.modify.col!==assignment.col)){
  return {text:`â†’${fullSizeTargetLabel(assignment.modify.row-1,assignment.modify.col)}`,kind:'remap'};
 }
 return null;
}
function updateProgrammingIndicators(){
 const disabled=[];
 const dksTargets=new Set();
 if(programming)for(const item of programming.keys){if(item.mode===4&&item.dks?.type===0&&item.dks.row>0)dksTargets.add(`${item.dks.row-1}:${item.dks.col}`);}
 for(const button of $('keyboard').querySelectorAll('.key')){
  const assignment=programming?.keys.find(k=>k.row+':'+k.col===button.dataset.id);
  const off=assignment?.locked===1;button.classList.toggle('key-off',off);
  const badge=programmingBadge(assignment);
  if(badge){button.dataset.assignment=badge.text;button.dataset.assignmentKind=badge.kind;}else{delete button.dataset.assignment;delete button.dataset.assignmentKind;}
  button.classList.toggle('key-dks-target',dksTargets.has(button.dataset.id));
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
      if(busy||document.body.dataset.page==='home')return;
      collapseHeFields();
      if(document.body.dataset.page==='range'||multipleSelection||event.ctrlKey||event.metaKey){
        if(selectedIds.has(key.id)){if(selectedIds.size===1)return;selectedIds.delete(key.id);if(key.id===selectedId){selectedId=[...selectedIds][0];showSelected();}}
        else {selectedIds.add(key.id);selectedId=key.id;}
        refreshSelection();
      }else{selectedIds=new Set([key.id]);selectedId=key.id;showSelected();}
    };
    $('keyboard').appendChild(button);
  }
  updateLightingPreview();
}
function activeLightingLayer(){return document.querySelector('[data-lighting-layer]:not([hidden])')?.dataset.lightingLayer||'back';}
const LIGHTING_EFFECT_NAMES={
 back:{1:'eq',2:'normal',3:'breath',4:'gradient',5:'stream',6:'star',7:'roll'},
 under:{3:'breath',4:'gradient',5:'stream',6:'star',7:'normal'}
};
const LIGHTING_EFFECT_DURATIONS={eq:1.8,breath:12,gradient:14,stream:2.8,star:5,roll:2.8,normal:0};
function lightingEffectName(layer,mode){return LIGHTING_EFFECT_NAMES[layer]?.[Number(mode)]||'';}
function lightingEffectDuration(name){return LIGHTING_EFFECT_DURATIONS[name]||3;}
function lightingPreviewDuration(name,state,draft){
 if(name==='eq')return 1.8;
 if(!name||name==='normal')return 0;
 const speed=Number.isFinite(draft)?draft:Number(state?.speed);
 if(Number.isFinite(speed)&&speed>0)return Math.max(1,Math.min(30,speed/1000));
 return lightingEffectDuration(name);
}
function lightingPreviewColor(input,state,fallback){
 const draft=String(input?.value||'').toLowerCase();
 if(/^#[0-9a-f]{6}$/.test(draft)&&draft!=='#000000')return draft;
 const saved=String(state?.color||'').toLowerCase();
 return /^#[0-9a-f]{6}$/.test(saved)&&saved!=='#000000'?saved:fallback;
}
function resetLightingPreview(){
 const board=$('keyboard');if(!board)return;
 for(const key of board.querySelectorAll('.key')){
  for(const name of [...key.classList])if(name.startsWith('key-preview'))key.classList.remove(name);
  for(const name of ['--preview-color','--preview-delay','--preview-duration','--preview-hue','--preview-brightness','--preview-direction'])key.style.removeProperty(name);
 }
 board.classList.remove('keyboard-back-preview','keyboard-rim','keyboard-stream-wave');
 delete board.dataset.backEffect;delete board.dataset.rimEffect;delete board.dataset.rimMode;delete board.dataset.underEffect;
 for(const name of ['--preview-brightness','--rim-color','--rim-duration','--rim-brightness','--rim-direction','--under-color','--under-duration','--under-brightness','--under-direction'])board.style.removeProperty(name);
}
function updateLightingPreview(){
 const board=$('keyboard');if(!board)return;
 resetLightingPreview();
 const keys=[...board.querySelectorAll('.key')];
 if(document.body.dataset.page!=='lighting'||!keys.length)return;
 const brightness=Math.max(0,Math.min(1,(lightingSavedBrightness??255)/255));
 const singleIds=new Set(singleState?.enabled?singleState.keys.filter(key=>key.enabled).map(key=>key.id):[]);
 const backState=lightingState;
 const backSelect=Number($('lighting-mode')?.value);
 const backMode=Number.isInteger(backSelect)&&backSelect?backSelect:Number(backState?.mode);
 const backName=lightingEffectName('back',backMode);
 const backCustomRgb=backState?.supportsCustomRgb?($('lighting-custom-rgb').closest('label').hidden?true:$('lighting-custom-rgb').checked):false;
 if(backState?.enabled&&backName){
  const color=lightingPreviewColor($('lighting-color'),backState,'#58b9ff');
  const duration=lightingPreviewDuration(backName,backState,lightingSpeedDraft);
  const reverse=!!backState.reverse;
  board.dataset.backEffect=backName;board.classList.add('keyboard-back-preview');
  board.style.setProperty('--preview-brightness',String(brightness));
  for(const [index,key] of keys.entries()){
   if(singleIds.has(key.dataset.id))continue;
   const [row,col]=key.dataset.id.split(':').map(Number);
   const delay=backName==='gradient'||backName==='star'||backName==='breath'?0:backName==='roll'?Number((-row*.16).toFixed(3)):Number((-(13-col)*.075-row*.02).toFixed(3));
   const hue=Math.round((col*23+row*8)%360);
   const usePalette=backName==='eq'||(['stream','roll'].includes(backName)&&!backCustomRgb);
   let previewColor=backName==='gradient'?'hsl(120 78% 46%)':backName==='breath'?(backCustomRgb?color:'hsl(120 78% 46%)'):usePalette?`hsl(${hue} 92% 64%)`:color;
   const starSeed=(row*73+col*151+37)%97;
   const starAccent=backName==='star'&&starSeed<40;
   if(backName==='star')previewColor=`hsl(${(240-col*20-row*3+360)%360} 90% 55%)`;
   key.classList.add('key-preview','key-preview-back','key-preview-effect-'+backName);
   if(backName==='breath')key.classList.add(backCustomRgb?'key-preview-breath-custom':'key-preview-breath-palette');
   key.style.setProperty('--preview-color',previewColor);
   key.style.setProperty('--preview-hue',String(hue));
   key.style.setProperty('--preview-delay',`${delay}s`);
   key.style.setProperty('--preview-duration',`${duration}s`);
   key.style.setProperty('--preview-direction',reverse?'reverse':'normal');
   if(starAccent){
    key.classList.add('key-preview-star-accent');
    key.style.setProperty('--star-accent',['#ff4dc4','#4dff88','#4dd2ff','#ffb84d'][starSeed%4]);
    key.style.setProperty('--preview-delay',`${(-((starSeed%13)/13*duration)).toFixed(3)}s`);
   }
  }
 }
 const singleRecords=singleState?.enabled?singleState.keys.filter(key=>key.enabled):[];
 if(singleRecords.length){
  const byId=new Map(keys.map(key=>[key.dataset.id,key]));
  for(const record of singleRecords){
   const key=byId.get(record.id);if(!key)continue;
   key.classList.add('key-preview','key-preview-single');
   key.style.setProperty('--preview-color',record.color);
   key.style.setProperty('--preview-brightness',String(Math.max(0,Math.min(1,Number(record.brightness)/255))));
   key.style.setProperty('--preview-duration','0s');
   key.style.setProperty('--preview-delay','0s');
  }
 }
 const underState=underLightState;
 let rim=null;
 if(underState?.enabled){
  const sync=underState.sync===1&&!!backState;
  const underSelect=Number($('underlight-mode')?.value);
  const underMode=sync?Number(backState.mode):Number.isInteger(underSelect)&&underSelect?underSelect:Number(underState.mode);
  const underName=sync?lightingEffectName('back',underMode):lightingEffectName('under',underMode);
  if(underName){
   const color=sync?lightingPreviewColor($('lighting-color'),backState,'#58b9ff'):lightingPreviewColor($('underlight-color'),underState,'#6fcbff');
   const reverse=sync?!!backState.reverse:!!underState.reverse;
   const rawUnderBrightness=Number(underState.brightness);
   const underBrightness=sync?brightness:Math.max(0,Math.min(1,(Number.isFinite(rawUnderBrightness)?rawUnderBrightness:255)/255));
   const underCustom=sync?backCustomRgb:!!$('underlight-custom-rgb').checked;
   let rimMode=underName;
   if(underName==='breath')rimMode=underCustom?'breath-custom':'breath-palette';
   else if(underName==='gradient')rimMode='gradient-cycle';
   else if(underName==='stream')rimMode='stream';
   else if(underName==='star')rimMode='star';
   else if(underName==='roll')rimMode='roll';
   else if(underName==='normal')rimMode='normal';
   const baseDuration=lightingPreviewDuration(underName,sync?backState:underState,sync?lightingSpeedDraft:underSpeedDraft);
   const rimDuration=underName==='normal'?0:underName==='breath'?baseDuration*4:underName==='stream'||underName==='star'?baseDuration*1.5:baseDuration;
   rim={name:underName,mode:rimMode,color,brightness:underBrightness,reverse,duration:Math.min(60,rimDuration)};
  }
 }
 if(rim){
  board.classList.add('keyboard-rim');
  board.dataset.rimEffect=rim.name;board.dataset.rimMode=rim.mode;
  const rimColor=rim.mode==='breath-palette'||rim.mode==='gradient-cycle'?'#22c55e':rim.mode==='stream'||rim.mode==='roll'?'#4dd2ff':rim.mode==='star'?'#2f7bff':rim.color;
  board.style.setProperty('--rim-color',rimColor);
  board.style.setProperty('--rim-duration',`${rim.duration}s`);
  board.style.setProperty('--rim-brightness',String(rim.brightness));
  board.style.setProperty('--rim-direction',rim.reverse?'reverse':'normal');
 }
}
window.updateLightingPreview=updateLightingPreview;
async function loadProfile(nextLayer=layer) {
  if(busy)return;
  discardLightingDraft();
  setBusy(true);$('status').textContent=`Reading M${nextLayer+1} from keyboard...`;
  try {
    const reply=await window.keyboard.readProfile(nextLayer);
    if(!reply.ok)throw new Error(reply.error);
    layer=nextLayer;profile=reply.result;
    $('preset-preview').textContent=`M${layer+1}: DKS changes W, A, S and D (W/S and A/D targets, interval 20). SNAP and SOCD affect A and D while preserving W/S. Off / Restore WASD defaults clears all four.`;
    $('preset-status').textContent='';
    programming=null;
    drawKeyboard();showSelected();
    for(const id of ['pair-first','pair-second','dks-source','dks-target']){
      const select=$(id),previous=select.value;select.replaceChildren();
      const assign=document.createElement('option');assign.value='';assign.textContent='Assign';select.appendChild(assign);
      for(const key of profile.layout){const option=document.createElement('option');option.value=key.id;option.textContent=`${key.label || 'Space'} (${key.row + 1}:${key.col + 1})`;select.appendChild(option);}
      if(id==='dks-target')for(const [action,label] of [['left-button','Left mouse button'],['right-button','Right mouse button'],['middle-button','Middle mouse button'],['wheel-up','Scroll up'],['wheel-down','Scroll down'],['up','Move mouse up'],['down','Move mouse down'],['left','Move mouse left'],['right','Move mouse right']]){
        const option=document.createElement('option');option.value=`mouse:${action}`;option.textContent=label;select.appendChild(option);
      }
      select.value=previous;
    }
    const programmed=await window.keyboard.readProgramming(layer);
  if(programmed.ok){programming=programmed.result;showPairState();showDksState();fillRemap();fillLayer();fillMedia();fillModify();updateProgrammingIndicators();}
    else $('pair-status').textContent=programmed.error;
    [...profileBar.children].forEach((b,i)=>b.classList.toggle('active',i===layer));
    deviceWasConnected=true;
    connectionRecoveryNeeded=false;
    document.querySelector('.online').textContent='Connected - device data loaded';
    $('status').textContent=`M${layer+1} read from keyboard. Select a switch to edit.`;
  } catch(error) {
    profile=null;programming=null;
    document.querySelector('.online').textContent='Device read unavailable: '+error.message;
    $('status').textContent=error.message;
    if(deviceWasConnected){connectionRecoveryNeeded=true;scheduleConnectionRecovery(1000);}
  } finally {setBusy(false);}
}
function scheduleConnectionRecovery(delay=450){
  clearTimeout(recoveryTimer);
  recoveryTimer=setTimeout(()=>recoverConnection(),delay);
}
async function recoverConnection(){
  recoveryTimer=null;
  if(recoveryInFlight||!deviceWasConnected)return;
  if(busy){scheduleConnectionRecovery(500);return;}
  recoveryInFlight=true;
  const status=document.querySelector('.online');
  if(status)status.textContent='Keyboard disconnected. Reconnecting...';
  try{
    if(connectionRecoveryNeeded){
      const reply=await window.keyboard.reconnect({timeout:12000,interval:250});
      if(!reply.ok)throw new Error(reply.error);
      connectionRecoveryNeeded=false;
    }
    await loadProfile(layer);
    if(profile){
      if(status)status.textContent='Keyboard reconnected - device data loaded';
      const page=document.body.dataset.page;
      if(page!=='lighting'){
        try{await readLightingMode();}catch{}
        try{await readUnderLight();}catch{}
        try{await readSingleLight();}catch{}
        updateLightingPreview();
      }
      if(page==='lighting')lightingBrightness().catch(()=>{});
      else if(page==='settings')deviceSettingsAction();
      else if(page==='calibration')refreshCalibration(true).catch(()=>{});
    }
    else {connectionRecoveryNeeded=true;scheduleConnectionRecovery(1500);}
  }catch(error){
    connectionRecoveryNeeded=true;
    if(status)status.textContent='Keyboard reconnect failed: '+error.message;
    scheduleConnectionRecovery(1500);
  }finally{recoveryInFlight=false;}
}
async function autoConnectAtStartup(){
  if(startupConnectInFlight||deviceWasConnected||busy)return;
  if(!navigator.hid){const status=document.querySelector('.online');if(status)status.textContent='Your browser is not supported.';return;}
  startupConnectInFlight=true;
  const status=document.querySelector('.online');
  if(status)status.textContent='Looking for a paired keyboard...';
  try{
    for(let attempt=0;attempt<60&&!deviceWasConnected;attempt++){
      const reply=await window.keyboard.autoConnect();
      if(reply.ok){if(status)status.textContent='Connected - browser HID. Reading device...';await loadProfile(layer);if(profile)return;}
      else if(/No paired M6 Lite\+ keyboard/.test(reply.error||''))break;
      if(attempt<59)await new Promise(resolve=>setTimeout(resolve,500));
    }
    if(status)status.textContent='Keyboard not connected.';
  }catch(error){
    if(status)status.textContent='Keyboard not connected.';
  }finally{startupConnectInFlight=false;}
}
window.m6UI={refresh:()=>loadProfile(layer)};
window.addEventListener('m6-device-status',event=>{
  const phase=event.detail?.phase;
  if(phase==='disconnected'&&deviceWasConnected){
    connectionRecoveryNeeded=true;
    const status=document.querySelector('.online');
    if(status)status.textContent=expectedDeviceRestart?'Keyboard is restarting. Reconnecting...':'Keyboard disconnected. Waiting for it to return...';
    scheduleConnectionRecovery(700);
  }else if(phase==='connected'&&deviceWasConnected){
    connectionRecoveryNeeded=false;
    scheduleConnectionRecovery(350);
  }
});
setInterval(()=>{
  if(deviceWasConnected&&connectionRecoveryNeeded&&!recoveryInFlight&&!recoveryTimer)scheduleConnectionRecovery(250);
},1000);
function setDeviceDataStatus(message){const status=document.getElementById('device-data-status');if(status)status.textContent=message;}
$('read').onclick=()=>{setDeviceDataStatus('Reading keyboard configuration...');loadProfile();};
$('save-memory').onclick=async()=>{if(busy)return;setBusy(true);const message='Saving to device memory...';$('status').textContent=message;setDeviceDataStatus(message);try{const reply=await window.keyboard.saveToDeviceMemory();if(!reply.ok)throw new Error(reply.error);const done='Save command acknowledged. Power-cycle verification is still required.';$('status').textContent=done;setDeviceDataStatus(done);}catch(e){$('status').textContent=e.message;setDeviceDataStatus(e.message);}finally{setBusy(false);}};
async function saveChanges(all=false) {
  if(busy||!profile)return;
  if(!ensureSelectedKey()){$('status').textContent='Select a switch first.';return;}
  const request={id:selectedId,ids:[...selectedIds],layer,rtOn:$('rt').checked};
  for(const field of travelFields) {
    if(!$(field).checkValidity()){$(field).reportValidity();return;}
    request[field]=$(field).valueAsNumber;
  }
  const current=profile.keys.find(k=>`${k.row}:${k.col}`===selectedId);
  if(!all&&selectedIds.size===1&&current&&current.rtOn===request.rtOn&&travelFields.every(f=>current[f]===request[f]))return;
  setBusy(true);$('status').textContent='Saving and reading back the selected switch...';
  try {
    const reply=await (all?window.keyboard.applyAll(request):window.keyboard.saveSelected(request));
    if(!reply.ok)throw new Error(reply.error);
    if(all||selectedIds.size>1) profile=reply.result;
    else {
      const saved=reply.result.key;
      profile.keys[profile.keys.findIndex(k=>k.row===saved.row&&k.col===saved.col)]=saved;
    }
    showSelected();$('status').textContent='Applied, saved to device memory and verified by readback.';
  } catch(error) {showSelected();$('status').textContent=error.message;}
  finally{setBusy(false);}
}
$('save').onclick=()=>saveChanges();
function changeMode(rtOn){
  if(busy||!profile)return;
  if(!ensureSelectedKey()){$('status').textContent='Select a switch first.';collapseHeFields();return;}
  showSelected();
  heFieldsVisible=true;
  $('rt').checked=rtOn;
  updateHeFieldsVisibility();
  $('status').textContent='Set the values, then Apply.';
  $('mode-mechanical').setAttribute('aria-pressed',String(!rtOn));$('mode-rt').setAttribute('aria-pressed',String(rtOn));
}
$('mode-mechanical').onclick=()=>changeMode(false);$('mode-rt').onclick=()=>changeMode(true);
$('apply-he').onclick=()=>saveChanges();
$('apply').onclick=()=>saveChanges(true);
function showPairState(){
  if(!programming)return;
  const names={0:'Standard',2:'Media',3:'FN/layer',4:'DKS',5:'Snap Tap',6:'SOCD / AD Cancel'};
  $('pair-current').textContent=['pair-first','pair-second'].map(id=>{
    const physical=profile.layout.find(k=>k.id===$(id).value);
    if(!physical)return 'Assign';
    const key=programming.keys.find(k=>k.row===physical.row&&k.col===physical.col);
    return key?`${physical.label}: ${names[key.mode]||'Other mode'}${key.locked?' (key disabled)':''}`:`${physical.label}: Unreadable`;
  }).join(' - ');
}
function showDksState(){
  const source=$('dks-source').value;
  if(!source){$('dks-target').value='';$('dks-status').textContent='Choose a source key and a DKS target.';if(typeof syncProgrammingSlots==='function')syncProgrammingSlots();return;}
  const [row,col]=source.split(':').map(Number),key=programming?.keys.find(k=>k.row===row&&k.col===col);
  if(!key)return;
  if(key.mode===4){
    if(key.dks.type===0&&key.dks.row>0)$('dks-target').value=`${key.dks.row-1}:${key.dks.col}`;
    if(key.dks.type===1)$('dks-target').value=key.dks.mouseAction?`mouse:${key.dks.mouseAction}`:'';
  }else $('dks-target').value='';
  $('dks-interval').value=key.mode===4?key.dks.interval:(key.dks.interval>=10&&key.dks.interval<=100?key.dks.interval:20);
  $('dks-status').textContent=key.mode===4?(key.locked?'DKS assigned; key disabled.':'DKS enabled.'):`DKS disabled (assignment mode ${key.mode}). Choose a target to enable.`;
  if(typeof syncProgrammingSlots==='function')syncProgrammingSlots();
}
$('dks-source').onchange=showDksState;
async function applyDks(enabled){
  if(busy||!programming)return;
  if(!$('dks-source').value||(enabled&&!$('dks-target').value)){$('dks-status').textContent='Choose a source key and a DKS target.';return;}
  if(enabled&&!$('dks-interval').reportValidity())return;
  setBusy(true);$('dks-status').textContent='Applying and verifying DKS...';
  try{
    const reply=await window.keyboard.setDks({layer,id:$('dks-source').value,target:$('dks-target').value,interval:$('dks-interval').valueAsNumber,enabled});
    if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();updateProgrammingIndicators();clearDksSelection();$('dks-status').textContent='DKS assignment verified.';
  }catch(error){$('dks-status').textContent=error.message;}finally{setBusy(false);}
}
async function applyWasd(enabled){
  if(busy||!programming)return;
  setBusy(true);$('preset-status').textContent='Applying WASD and verifying all assignments...';
  try{
    const reply=enabled?await window.keyboard.quickPreset({layer,preset:'dks'}):await window.keyboard.setDksWasd({layer,enabled});if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();updateProgrammingIndicators();clearDksSelection();$('preset-status').textContent=enabled?'DKS enabled on W, A, S and D.':'WASD DKS disabled.';
  }catch(error){$('preset-status').textContent=error.message;}finally{setBusy(false);}
}
async function applySnapPreset(enabled){
  if(busy||!programming)return;
  setBusy(true);$('preset-status').textContent='Applying SNAP to A / D and verifying...';
  try{
    const reply=enabled?await window.keyboard.quickPreset({layer,preset:'snap'}):await window.keyboard.setPair({layer,first:'2:1',second:'2:3',mode:0});
    if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();updateProgrammingIndicators();clearPairSelection();$('preset-status').textContent=enabled?'SNAP enabled on A and D; W/S unchanged.':'A / D SNAP disabled.';
  }catch(error){$('preset-status').textContent=error.message;}finally{setBusy(false);}
}
async function applyClPreset(){
  if(busy||!programming)return;
  setBusy(true);$('preset-status').textContent='Applying SOCD to A / D and verifying...';
  try{
    const reply=await window.keyboard.quickPreset({layer,preset:'cl'});
    if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();updateProgrammingIndicators();clearPairSelection();
    $('preset-status').textContent='SOCD enabled on A and D; W/S unchanged.';
  }catch(error){$('preset-status').textContent=error.message;}finally{setBusy(false);}
}
async function applyPresetOff(){
  if(busy||!programming)return;
  setBusy(true);$('preset-status').textContent='Disabling quick presets and verifying all assignments...';
  try{
    const reply=await window.keyboard.presetOff({layer});if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();updateProgrammingIndicators();clearDksSelection();clearPairSelection();
    $('preset-status').textContent=reply.result.changed?'Quick presets disabled. Device readback verified.':'Quick presets are already off.';
  }catch(error){$('preset-status').textContent=error.message;}finally{setBusy(false);}
}
$('snap-ad').onclick=()=>applySnapPreset(true);$('snap-ad-disable').onclick=()=>applySnapPreset(false);
$('cl-ad').onclick=applyClPreset;
$('dks-wasd').onclick=()=>applyWasd(true);$('dks-wasd-disable').onclick=()=>applyWasd(false);
$('preset-off').onclick=applyPresetOff;$('preset-defaults').onclick=applyPresetOff;
$('dks-apply').onclick=()=>applyDks(true);$('dks-disable').onclick=()=>applyDks(false);
$('pair-first').onchange=showPairState;$('pair-second').onchange=showPairState;
function clearPairSelection(){$('pair-first').value='';$('pair-second').value='';if(typeof syncProgrammingSlots==='function')syncProgrammingSlots();showPairState();}
function clearDksSelection(){$('dks-source').value='';$('dks-target').value='';if(typeof syncProgrammingSlots==='function')syncProgrammingSlots();}
async function applyPair(disable=false){
  if(busy||!programming)return;
  const first=$('pair-first').value,second=$('pair-second').value;
  if(!first||!second||first===second){$('pair-status').textContent='Choose two different switches.';return;}
  setBusy(true);$('pair-status').textContent='Applying pair and verifying device readback...';
  try{
    const reply=await window.keyboard.setPair({layer,first:$('pair-first').value,second:$('pair-second').value,mode:disable?0:Number($('pair-mode').value)});
    if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;showPairState();showDksState();updateProgrammingIndicators();clearPairSelection();$('pair-status').textContent=disable?'Pair disabled and verified.':'Pair applied and verified.';
  }catch(error){$('pair-status').textContent=error.message;}
  finally{setBusy(false);}
}
$('pair-apply').onclick=()=>applyPair();$('pair-disable').onclick=()=>applyPair(true);
const settingsPanel=document.createElement('section');settingsPanel.className='panel';settingsPanel.id='settings-panel';settingsPanel.hidden=true;
settingsPanel.innerHTML='<small>DEVICE SETTINGS</small><div class="performance-card"><div class="performance-heading"><h2 id="performance-name">Keyboard Mode</h2><label class="fps-switch"><span>FPS Enhance</span><input id="device-fps" type="checkbox" disabled></label></div><p>Switching modes reboots the keyboard.</p><div class="performance-modes" role="group" aria-label="Keyboard mode"><button type="button" data-performance-mode="0" aria-pressed="false">BeastMode</button><button type="button" data-performance-mode="1" aria-pressed="false">EyeMode</button><button type="button" data-performance-mode="2" aria-pressed="false">DevMode</button></div><div class="actions"><button id="device-mode-apply" disabled>Apply mode</button><button id="device-settings-read" class="secondary">Refresh</button></div></div><p>FPS Enhance is independent of the selected mode. It prioritizes scanning the two rows containing WASD; other rows use a lower scan rate.</p><p id="device-settings-status" role="status"></p>';
remapPanel.after(settingsPanel);let deviceSettings=null,performanceDraft=null;
settingsPanel.insertAdjacentHTML('beforeend',`
 <div class="device-options-grid">
  <section class="device-option" data-setting="highlight">
   <label class="device-option-heading" for="device-highlight"><h3>Highlight</h3><input id="device-highlight" type="checkbox" disabled></label>
   <p>MMPanel recommends leaving Highlight off for high precision use.</p>
   <button id="device-highlight-apply" disabled>Apply Highlight</button>
  </section>
  <section class="device-option" data-setting="autoCalibration">
   <label class="device-option-heading" for="device-auto-calibration"><h3>Auto calibration</h3><input id="device-auto-calibration" type="checkbox" disabled></label>
   <p>Enable the keyboard's automatic calibration aid. Initial manual calibration is still required. Applying reloads the page to reconnect.</p>
   <button id="device-auto-calibration-apply" disabled>Apply Auto calibration</button>
  </section>
  <section class="device-option" data-setting="autoLightOff">
   <label class="device-option-heading" for="device-auto-light-off"><h3>Auto light off</h3><input id="device-auto-light-off" type="checkbox" disabled></label>
   <p>Turn the lights off after inactivity.</p>
   <label class="device-setting-range" for="device-auto-light-off-minutes">Delay <input id="device-auto-light-off-minutes" type="range" min="1" max="30" step="1" disabled><output id="device-auto-light-off-value" for="device-auto-light-off-minutes"></output></label>
   <button id="device-auto-light-off-apply" disabled>Apply Auto light off</button>
  </section>
  <section class="device-option" data-setting="saturation">
   <h3>Saturation</h3><p>Adjust the keyboard's R, G and B levels (64-255).</p>
   ${['R','G','B'].map((channel,i)=>`<label class="device-setting-range" for="device-saturation-${i}">${channel} <input id="device-saturation-${i}" type="range" min="64" max="255" step="1" disabled><output id="device-saturation-value-${i}" for="device-saturation-${i}"></output></label>`).join('')}
   <button id="device-saturation-apply" disabled>Apply Saturation</button>
  </section>
 </div>`);
const settingActions={
 highlight:{capability:'canEditHighlight',label:'Highlight',apply:()=>window.keyboard.setHighlight($('device-highlight').checked)},
 autoCalibration:{capability:'canEditAutoCalibration',label:'Auto calibration',apply:()=>window.keyboard.setAutoCalibration($('device-auto-calibration').checked,{verify:false})},
 autoLightOff:{capability:'canEditAutoLightOff',label:'Auto light off',apply:()=>window.keyboard.setAutoLightOff({enabled:$('device-auto-light-off').checked,...($('device-auto-light-off').checked?{minutes:Number($('device-auto-light-off-minutes').value)}:{})})},
 saturation:{capability:'canEditSaturation',label:'Saturation',apply:()=>window.keyboard.setSaturation([0,1,2].map(i=>Number($('device-saturation-'+i).value)))}
};
function updateSettingControls(){
 for(const [name,action] of Object.entries(settingActions)){
  const card=settingsPanel.querySelector(`[data-setting="${name}"]`),supported=!!deviceSettings?.[action.capability];
  card.querySelectorAll('input,button').forEach(control=>{control.disabled=busy||!supported;});
  card.title=deviceSettings&&!supported?'Unrecognized device value. Refresh to read again.':'';
 }
 $('device-auto-light-off-minutes').disabled=busy||!deviceSettings?.canEditAutoLightOff||!$('device-auto-light-off').checked;
}
function showDeviceSettings(){
 showPerformanceMode();$('device-fps').checked=deviceSettings?.fpsEnhance===1;
 $('device-highlight').checked=deviceSettings?.highlight===1;
 $('device-auto-calibration').checked=deviceSettings?.autoCalibration===1;
 $('device-auto-light-off').checked=deviceSettings?.autoLightOff===1;
 const delay=deviceSettings?.autoLightOffMinutes;
 $('device-auto-light-off-minutes').value=Number.isInteger(delay)&&delay>=1&&delay<=30?delay:1;
 $('device-auto-light-off-value').value=$('device-auto-light-off-minutes').value+' min';
 for(const i of [0,1,2]){
  $('device-saturation-'+i).value=deviceSettings?.saturation?.[i]??64;
  $('device-saturation-value-'+i).value=deviceSettings?.saturation?.[i]??'â€”';
 }
 updateSettingControls();
}
for(const [id,name] of [['highlight','highlight'],['auto-calibration','autoCalibration'],['auto-light-off','autoLightOff'],['saturation','saturation']]){
 $('device-'+id+'-apply').onclick=()=>deviceSettingsAction(name);
}
settingsPanel.querySelectorAll('.device-option input').forEach(input=>input.addEventListener('input',()=>{
 $('device-auto-light-off-value').value=$('device-auto-light-off-minutes').value+' min';
 for(const i of [0,1,2])$('device-saturation-value-'+i).value=$('device-saturation-'+i).value;
 updateSettingControls();$('device-settings-status').textContent='Applying to the keyboard...';
}));
function showPerformanceMode(){
 performanceDraft=deviceSettings?.canEditPerformance?deviceSettings.performanceMode:null;
 $('performance-name').textContent='Keyboard Mode';
 for(const button of settingsPanel.querySelectorAll('[data-performance-mode]'))button.setAttribute('aria-pressed',String(Number(button.dataset.performanceMode)===performanceDraft));
}
for(const button of settingsPanel.querySelectorAll('[data-performance-mode]'))button.onclick=()=>{
 if(busy||!deviceSettings?.canEditPerformance)return;
 performanceDraft=Number(button.dataset.performanceMode);
 for(const item of settingsPanel.querySelectorAll('[data-performance-mode]'))item.setAttribute('aria-pressed',String(item===button));
 $('device-settings-status').textContent=['BeastMode','EyeMode','DevMode'][performanceDraft]+' selected. Applying to the keyboard...';
};
async function deviceSettingsAction(apply=false){
 const action=settingActions[apply];
 if(busy||(action?!deviceSettings?.[action.capability]:apply==='mode'?!deviceSettings?.canEditPerformance:apply&&!deviceSettings?.canEditFps))return;
 const enabled=$('device-fps').checked,mode=performanceDraft,autoCalibration=apply==='autoCalibration';expectedDeviceRestart=apply==='mode'||autoCalibration;setBusy(true);$('device-settings-status').textContent=apply?'Applying device settings...':'Reading device settings...';
 if(autoCalibration)setTimeout(()=>window.location.reload(),2000);
 let reloadAfterRestart=false;
 try{
   const reply=await (action?action.apply():apply==='mode'?window.keyboard.setPerformanceMode(mode):apply?window.keyboard.setFpsEnhance(enabled):window.keyboard.readDeviceSettings());
    if(!reply.ok)throw Error(reply.error);deviceSettings=apply?{...deviceSettings,...reply.result}:reply.result;showDeviceSettings();reloadAfterRestart=(apply==='mode'&&!!reply.result.reconnectPending)||autoCalibration;
    $('device-settings-status').textContent=apply?(autoCalibration?'Auto calibration applied. Reloading the page to reconnect...':reloadAfterRestart?'Performance mode applied. Reloading after keyboard restart...':(action?.label||'FPS Enhance')+' applied and verified on the keyboard. No device-memory save command was sent.'):'';
 }catch(error){deviceSettings=null;showDeviceSettings();$('device-settings-status').textContent=error.message;if(autoCalibration){reloadAfterRestart=true;$('device-settings-status').textContent='Auto calibration apply did not complete. Reloading the page to reconnect...';}}
 finally{setBusy(false);}
 if(reloadAfterRestart){setTimeout(()=>window.location.reload(),autoCalibration?1200:900);return;}
 expectedDeviceRestart=false;
}
$('device-mode-apply').onclick=()=>deviceSettingsAction('mode');
$('device-settings-read').onclick=()=>deviceSettingsAction();$('device-fps').onchange=()=>deviceSettingsAction(true);
document.querySelectorAll('aside .nav').forEach((nav,i)=>{
  nav.dataset.title=nav.textContent.trim();
  if(![0,1,3].includes(i)){const badge=document.createElement('small');badge.textContent='In development';badge.className='development-badge';nav.appendChild(badge);}
  nav.onclick=()=>{
    if(busy)return;
    showDeviceSettings();showSelected();
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
calibrationNav.onclick=()=>{if(!busy)window.m6UI?.navigate?.('calibration');};
setBusy(false);updateModifyState();
restoreCalibrationState().catch(error=>{$("lighting-mode-status").textContent=error.message;});
setTimeout(autoConnectAtStartup,0);

// Automatic apply: every edited control writes, verifies and persists without a separate Apply button.
function hideAutoControls(ids){
  for(const id of ids){
    const element=$(id);
    if(!element)continue;
    element.hidden=true;
    element.style.display='none';
  }
}
function autoApply(action,delay=250){
  let timer=null;
  const run=async()=>{
    if(busy){timer=setTimeout(run,150);return;}
    try{await action();}catch(error){}
  };
  return ()=>{clearTimeout(timer);timer=setTimeout(run,delay);};
}
hideAutoControls([
  'read','save-memory','save','apply',
  'lighting-read','lighting-apply','lighting-mode-apply','lighting-color-apply','lighting-speed-apply','lighting-direction-apply',
  'backlight-enabled-apply','underlight-read','underlight-apply','underlight-color-apply','underlight-speed-apply','underlight-brightness-apply','underlight-enabled-apply','underlight-sync-apply',
  'single-read','single-apply','single-active-apply','single-brightness-apply',
  'remap-apply','layer-apply','media-apply','modify-apply','hotkey-apply','dks-apply','pair-apply','key-enabled-apply',
  'device-mode-apply','device-settings-read','device-highlight-apply','device-auto-calibration-apply','device-auto-light-off-apply','device-saturation-apply',
  'calibration-read'
]);
$('lighting-brightness').addEventListener('change',autoApply(()=>$('lighting-apply').click(),250));
$('lighting-mode').addEventListener('change',autoApply(()=>$('lighting-mode-apply').click(),80));
$('lighting-color').addEventListener('change',autoApply(()=>$('lighting-color-apply').click(),250));
$('lighting-custom-rgb').addEventListener('change',autoApply(()=>$('lighting-color-apply').click(),80));
$('lighting-speed').addEventListener('change',autoApply(()=>$('lighting-speed-apply').click(),250));
$('lighting-reverse').addEventListener('change',autoApply(()=>$('lighting-direction-apply').click(),80));
$('underlight-mode').addEventListener('change',autoApply(()=>$('underlight-apply').click(),80));
$('underlight-color').addEventListener('change',autoApply(()=>$('underlight-color-apply').click(),250));
$('underlight-custom-rgb').addEventListener('change',autoApply(()=>$('underlight-color-apply').click(),80));
$('underlight-speed').addEventListener('change',autoApply(()=>$('underlight-speed-apply').click(),250));
$('underlight-brightness').addEventListener('change',autoApply(()=>$('underlight-brightness-apply').click(),250));
$('underlight-enabled').addEventListener('change',autoApply(()=>$('underlight-enabled-apply').click(),80));
$('single-active').addEventListener('change',autoApply(()=>$('single-active-apply').click(),80));
$('single-color').addEventListener('change',autoApply(()=>singleAction('color'),250));
$('single-enabled').addEventListener('change',autoApply(()=>singleAction('enabled'),80));
$('single-brightness').addEventListener('change',autoApply(()=>$('single-brightness-apply').click(),250));
$('layer-target').addEventListener('change',autoApply(()=>$('layer-apply').click(),80));
$('media-action').addEventListener('change',autoApply(()=>$('media-apply').click(),80));
$('hotkey-interval').addEventListener('change',autoApply(()=>$('hotkey-apply').click(),250));
$('dks-target').addEventListener('change',autoApply(()=>$('dks-apply').click(),80));
$('dks-interval').addEventListener('change',autoApply(()=>$('dks-apply').click(),250));
for(const id of ['modify-type','modify-button','modify-x','modify-y','modify-wheel','modify-mode'])$(id).addEventListener('change',autoApply(()=>$('modify-apply').click(),250));
const applyModifySoon=autoApply(()=>$('modify-apply').click(),80);
$('modify-hotkey').addEventListener('change',()=>{const source=$('modify-source').value,[row,col]=source.split(':').map(Number),key=programming?.keys.find(k=>k.row===row&&k.col===col);if(busy||!key||key.mode!==0){$('modify-hotkey').checked=key?.modify?.mode===2;$('modify-status').textContent=key?'HotKey is available for Standard switches only.':'Select a switch first.';return;}$('modify-status').textContent=$('modify-hotkey').checked?'Applying HotKey...':'Removing HotKey...';applyModifySoon();});
$('key-enabled').addEventListener('change',autoApply(()=>$('key-enabled-apply').click(),80));
$('pair-mode').addEventListener('change',autoApply(()=>$('pair-apply').click(),80));
for(const button of document.querySelectorAll('[data-pair-mode]'))button.addEventListener('click',autoApply(()=>$('pair-apply').click(),80));
for(const button of settingsPanel.querySelectorAll('[data-performance-mode]'))button.addEventListener('click',autoApply(()=>deviceSettingsAction('mode'),80));
$('device-highlight').addEventListener('change',autoApply(()=>deviceSettingsAction('highlight'),80));
$('device-auto-calibration').addEventListener('change',autoApply(()=>deviceSettingsAction('autoCalibration'),80));
$('device-auto-light-off').addEventListener('change',autoApply(()=>deviceSettingsAction('autoLightOff'),80));
$('device-auto-light-off-minutes').addEventListener('change',autoApply(()=>deviceSettingsAction('autoLightOff'),250));
for(const i of [0,1,2])$('device-saturation-'+i).addEventListener('change',autoApply(()=>deviceSettingsAction('saturation'),250));



window.addEventListener('pagehide',()=>{window.keyboard?.disconnect?.();});
