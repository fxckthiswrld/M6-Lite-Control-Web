'use strict';
// Adapt the existing verified controllers without duplicating USB state in React.
const originalNavigation=[...document.querySelectorAll('aside .nav')];
document.querySelector('aside').id='legacy-navigation';
const homePanel=document.createElement('section');homePanel.id='home-content';document.querySelector('main').append(homePanel);
const sectionToolbar=document.createElement('div');sectionToolbar.id='section-toolbar';$('keyboard').before(sectionToolbar);
const lightingTabs=document.createElement('div');lightingTabs.id='lighting-tabs';lightingPanel.before(lightingTabs);
const programmingTabs=document.createElement('div');programmingTabs.id='programming-tabs';remapPanel.before(programmingTabs);
programmingTabs.before(presetPanel);
const programmingGroups={};
for(const panel of [remapPanel,advancedPanel]){let group='';for(const node of [...panel.children]){
 if(node.tagName==='H2')group=node.textContent;
 if(!group||node.tagName==='HR'||node.dataset.action==='programming-back'){node.hidden=true;continue;}
 (programmingGroups[group]??=[]).push(node);
}}
if(programmingGroups.Modify){
 programmingGroups.Remap=[...(programmingGroups.Remap||[]),...programmingGroups.Modify];
 delete programmingGroups.Modify;
}
let programmingView='Remap';
const programmingCards={};
function programmingTab(tab){if(busy)return;fillRemap();fillLayer();fillMedia();fillModify();fillHotKey();showPairState();showDksState();syncProgrammingSelection();programmingView=tab;for(const [name,nodes] of Object.entries(programmingGroups))for(const node of nodes)node.hidden=false;for(const [name,card] of Object.entries(programmingCards))card.open=name===tab;
 if(uiPage==='programming'){remapPanel.hidden=false;advancedPanel.hidden=false;for(const panel of [remapPanel,advancedPanel]){panel.classList.remove('tab-enter');void panel.offsetWidth;panel.classList.add('tab-enter');}}
}
const programmingLayout=document.createElement('div');programmingLayout.id='programming-layout';
const programmingHelp=document.createElement('section');programmingHelp.className='programming-help-card';programmingHelp.innerHTML='<small>PROGRAMMING</small><h3>Program your keys</h3><p>Select a physical key on the keyboard above, then choose its action in one of the panels.</p><p>Each panel expands to show the available settings. Apply writes the selected key and verifies the result on the keyboard.</p><div class="programming-help-step"><b>1</b><span>Select a source key above</span></div><div class="programming-help-step"><b>2</b><span>Choose an action or target key</span></div><div class="programming-help-step"><b>3</b><span>Apply and read back the setting</span></div>';
const programmingWorkspace=document.createElement('div');programmingWorkspace.className='programming-workspace';const programmingAccordion=document.createElement('div');programmingAccordion.className='programming-accordion';programmingWorkspace.append(programmingAccordion);programmingLayout.append(programmingHelp,programmingWorkspace);remapPanel.before(programmingLayout);programmingWorkspace.append(remapPanel,advancedPanel);
const presetCard=document.createElement('details');presetCard.className='programming-card';presetCard.open=true;const presetSummary=document.createElement('summary');presetSummary.textContent='Quick presets';presetCard.append(presetSummary,presetPanel);programmingAccordion.append(presetCard);
for(const [name,nodes] of Object.entries(programmingGroups)){const card=document.createElement('details');card.className='programming-card';card.dataset.programmingGroup=name;const summary=document.createElement('summary');summary.textContent=name==='Layer assignment'?'FN / Layer assignment':name==='Snap Tap / SOCD'?'Snap Tap / SOCD':name;card.append(summary);for(const node of nodes){if(node.tagName==='H2')node.hidden=true;node.hidden=false;card.append(node);}programmingAccordion.append(card);programmingCards[name]=card;}
function programmingIconLabel(text){const value=String(text||'').trim();if(value.length<=3)return value;const abbreviations={'Backspace':'BACK','Print Screen':'PRT SC','Scroll Lock':'SLK','Pause':'PAUSE','Insert':'INS','Delete':'DEL','Home':'HOME','End':'END','Page Up':'PG UP','Page Down':'PG DN','Num Lock':'NUM','Num /':'NUM /','Num *':'NUM *','Num -':'NUM -','Num +':'NUM +','Num 7':'NUM 7','Num 8':'NUM 8','Num 9':'NUM 9','Num 4':'NUM 4','Num 5':'NUM 5','Num 6':'NUM 6','Num 1':'NUM 1','Num 2':'NUM 2','Num 3':'NUM 3','Num 0':'NUM 0','Num .':'NUM .','Num Enter':'NUM ENT','Caps Lock':'CAPS','Left Shift':'L-SH','Right Shift':'R-SH','Left Ctrl':'L-CTRL','Right Ctrl':'R-CTRL','Left Alt':'L-ALT','Right Alt':'R-ALT','Left Win':'L-WIN','Right Win':'R-WIN','Left Arrow':'←','Down Arrow':'↓','Up Arrow':'↑','Right Arrow':'→'};if(abbreviations[value])return abbreviations[value];const icons=[['media','♫'],['mouse','🖱'],['wheel','↕'],['snap','⇄'],['socd','⇄'],['dks','⌘'],['fn','Fn'],['layer','▱'],['reset','↺'],['disable','⏻'],['standard','⌨'],['keyboard','⌨'],['hotkey','⟳']];const match=icons.find(([word])=>value.toLowerCase().includes(word));return match?.[1]||value.slice(0,6).toUpperCase();}
const fullSizeKeyboardKeys=['Esc','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','Print Screen','Scroll Lock','Pause','1','2','3','4','5','6','7','8','9','0','-','=', 'Backspace','Insert','Home','Page Up','Num Lock','Num /','Num *','Num -','Tab','Q','W','E','R','T','Y','U','I','O','P','[',']','\\','Delete','End','Page Down','Num 7','Num 8','Num 9','Num +','Caps Lock','A','S','D','F','G','H','J','K','L',';','\'','Enter','Num 4','Num 5','Num 6','Left Shift','Z','X','C','V','B','N','M',',','.','/','Right Shift','Num 1','Num 2','Num 3','Num Enter','Left Ctrl','Left Win','Left Alt','Space','Right Alt','Right Win','Menu','Right Ctrl','Left Arrow','Down Arrow','Up Arrow','Right Arrow','Num 0','Num .'];
function renderProgrammingIconPicker(select){
 if(!select||select.dataset.iconPicker==='true')return;
 const picker=document.createElement('div');picker.className='programming-icon-picker';picker.setAttribute('role','listbox');picker.setAttribute('aria-label',select.previousElementSibling?.textContent||'Choose an option');
 const isBasic=value=>/^(ESC|[0-9]|[A-Z]|[=+\-_.;,:'"/\\`\[\]])$/i.test(String(value||'').trim());
 const addButton=(option,parent)=>{const button=document.createElement('button');button.type='button';button.className='programming-icon-option';button.dataset.value=option.value;button.title=option.textContent;button.setAttribute('aria-label',option.textContent);button.textContent=programmingIconLabel(option.textContent);if(option.value===select.value)button.classList.add('selected');button.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));};parent.append(button);};
 const refresh=()=>{picker.replaceChildren();if(select.id==='remap-target'){const physical=[...select.options],known=new Set(physical.map(option=>String(option.textContent).trim().toLowerCase()));for(const [title,options] of [['Basic Characters',physical.filter(option=>isBasic(option.textContent))],['Extended Characters',physical.filter(option=>!isBasic(option.textContent))]]){const section=document.createElement('section');section.className='programming-icon-section';const heading=document.createElement('h4');heading.textContent=title;section.append(heading);const grid=document.createElement('div');grid.className='programming-icon-grid';options.forEach(option=>addButton(option,grid));for(const label of fullSizeKeyboardKeys.filter(label=>(isBasic(label)=== (title==='Basic Characters'))&&!known.has(label.toLowerCase()))){const button=document.createElement('button');button.type='button';button.className='programming-icon-option full-size-key';button.title=`${label} — full-size keyboard key`;button.setAttribute('aria-label',label);button.textContent=programmingIconLabel(label);grid.append(button);}section.append(grid);picker.append(section);}}else{const grid=document.createElement('div');grid.className='programming-icon-grid';[...select.options].forEach(option=>addButton(option,grid));picker.append(grid);}};
 select.dataset.iconPicker='true';select.classList.add('programming-icon-select');select.after(picker);select.addEventListener('change',refresh);new MutationObserver(refresh).observe(select,{childList:true});refresh();
}
const programmingSourceIds=new Set(['remap-source','modify-source','media-source','layer-source','dks-source','hotkey-source','pair-first','pair-second','modify-target']);
for(const select of programmingLayout.querySelectorAll('select'))if(!programmingSourceIds.has(select.id))renderProgrammingIconPicker(select);
const settingsFooter=document.createElement('div');settingsFooter.id='settings-footer';settingsPanel.append(settingsFooter);
const lightingGroups={back:[],under:[],single:[]};const lightingWrappers={};let lightGroup='back';
for(const node of [...lightingPanel.children]){if(node.tagName==='H2'&&node.textContent==='Under Light')lightGroup='under';if(node.tagName==='H2'&&node.textContent==='Single Light')lightGroup='single';lightingGroups[lightGroup].push(node);}
for(const [name,nodes] of Object.entries(lightingGroups)){const wrapper=document.createElement('section');wrapper.className=`lighting-layer-card lighting-${name}-card`;wrapper.dataset.lightingLayer=name;nodes.forEach(node=>wrapper.append(node));lightingPanel.append(wrapper);lightingWrappers[name]=wrapper;}
{
 const back=lightingWrappers.back;const under=lightingWrappers.under;const color=back.querySelector('#lighting-color-controls');
 if(color){
  const service=back.querySelector('.lighting-service-controls');
  const title=[...back.children].filter(node=>node.tagName==='SMALL'||(node.tagName==='H2'&&node.textContent==='Lighting control'));
  const global=back.querySelector('.lighting-global');
  // Back Light brightness belongs to the Back Light controls. Keep the existing
  // nodes and IDs so renderer handlers and device readback remain intact.
  const content=document.createElement('div');content.className='lighting-back-content';
  const colours=document.createElement('section');colours.className='lighting-colours-card';colours.innerHTML='<h3>Colours</h3>';colours.append(color);
  const effects=document.createElement('section');effects.className='lighting-effects-card';effects.innerHTML='<h3>Effects</h3>';
  const effectNodes=[...back.children].filter(node=>node!==service&&!title.includes(node)&&node!==global&&node!==color);
  effects.append(global,...effectNodes.filter(node=>node!==global));
  // The Back Light panel starts directly with its controls; the legacy
  // LIGHTING / Lighting control heading is intentionally removed.
  back.replaceChildren(...[service,content].filter(Boolean));
  content.append(colours,effects);
 }
 // Give Under Light the same compact, Wootility-style composition as Back Light.
 // Only containers move here; the original controls and their IDs stay intact.
 {
  const under=lightingWrappers.under;
  const underHeading=under.querySelector('h2');
  const underNodes=[...under.children];
  const underColourInput=under.querySelector('#underlight-color');
  const underColourControls=underColourInput?.closest('.controls');
  const underColourTitle=underColourControls?.previousElementSibling;
  const underColourApply=underColourControls?.nextElementSibling;
  const underColourNote=underColourApply?.nextElementSibling;
  const underMode=under.querySelector('#underlight-mode')?.closest('.controls');
  const underModeApply=under.querySelector('#underlight-apply');
  const underCurrent=under.querySelector('#underlight-current');
  const underStatus=under.querySelector('#underlight-status');
  const underSpeed=under.querySelector('#underlight-speed')?.closest('.lighting-section');
  const underBrightness=under.querySelector('#underlight-brightness')?.closest('.lighting-section');
  const underPowerTitle=[...under.children].find(node=>node.tagName==='H3'&&node.textContent==='Under Light power');
  const underPowerLabel=underPowerTitle?.nextElementSibling;
  const underPowerApply=underPowerLabel?.nextElementSibling;
  const underSyncTitle=[...under.children].find(node=>node.tagName==='H3'&&node.textContent==='Under Light synchronization');
  const underSyncLabel=underSyncTitle?.nextElementSibling;
  const underSyncApply=underSyncLabel?.nextElementSibling;
  const underSyncNote=underSyncApply?.nextElementSibling;
  if(underHeading&&underColourControls&&underMode){
   const content=document.createElement('div');content.className='lighting-under-content';
   const colours=document.createElement('section');colours.className='lighting-under-colours-card';colours.innerHTML='<h3>Colours</h3>';
   const effects=document.createElement('section');effects.className='lighting-under-effects-card';effects.innerHTML='<h3>Effects</h3>';
   const modeBlock=document.createElement('div');modeBlock.className='lighting-under-mode';
   [underCurrent,underMode,underModeApply,underStatus].filter(Boolean).forEach(node=>modeBlock.append(node));
   const colourBlock=document.createElement('div');colourBlock.className='lighting-under-colour';
   [underColourTitle,underColourControls,underColourApply,underColourNote].filter(Boolean).forEach(node=>colourBlock.append(node));
   colours.append(colourBlock);
   // Power is kept in the DOM for the verified renderer handlers, but is not
   // exposed in the Wootility-style Under Light controls.
   const powerService=document.createElement('div');powerService.className='underlight-service-controls';powerService.hidden=true;powerService.setAttribute('aria-hidden','true');
   [underPowerTitle,underPowerLabel,underPowerApply].filter(Boolean).forEach(node=>powerService.append(node));
   under.append(powerService);
   if(underSyncLabel)underSyncLabel.classList.add('toggle-row');
   [underBrightness,modeBlock,underSpeed,underSyncTitle,underSyncLabel,underSyncApply,underSyncNote].filter(Boolean).forEach(node=>effects.append(node));
   content.append(colours,effects);
   under.replaceChildren(underHeading);
   under.append(content);
   under.append(powerService);
   if(underSyncApply)underSyncApply.hidden=true;
   const syncInput=under.querySelector('#underlight-sync');
   if(syncInput)syncInput.addEventListener('change',()=>{if(!busy&&!syncInput.disabled)underSyncApply?.click();});
  }
 }
}
let uiPage='home';
function navigateUI(page){
 if(busy)return false;
 discardLightingDraft();showSelected();
 fillRemap();fillLayer();fillMedia();fillModify();fillHotKey();showPairState();showDksState();
 for(const panel of [hePanel,advancedPanel,remapPanel,pendingPanel,calibrationPanel,lightingPanel,settingsPanel])panel.hidden=true;
 uiPage=page;document.body.dataset.page=page;
 homePanel.hidden=page!=='home';presetPanel.hidden=page!=='programming';
 programmingLayout.hidden=page!=='programming';
 profileBar.hidden=!['range','programming'].includes(page);selectionBar.hidden=page!=='range';
 $('keyboard').hidden=['settings','calibration'].includes(page);keyStateSummary.hidden=page!=='programming';
 document.querySelector('.key-legend').hidden=page!=='range';lightingTabs.hidden=page!=='lighting';
 programmingTabs.hidden=page!=='programming';
 if(page==='range')hePanel.hidden=false;
 if(page==='programming'){selectedIds=new Set([selectedId]);refreshSelection();programmingTab(programmingView);}
 if(page==='lighting'){lightingPanel.hidden=false;lightingBrightness();}
 if(page==='settings'){settingsPanel.hidden=false;deviceSettingsAction();}
 if(page==='calibration'){calibrationPanel.hidden=false;restoreCalibrationState();}
 window.dispatchEvent(new CustomEvent('m6-page',{detail:page}));window.scrollTo(0,0);return true;
}
function lightingTab(tab){if(uiPage==='lighting'&&!busy)discardLightingDraft();for(const [name,nodes] of Object.entries(lightingGroups)){lightingWrappers[name].hidden=name!==tab;for(const node of nodes)node.hidden=false;}const active=lightingGroups[tab]?.[0];if(active){active.classList.remove('tab-enter');void active.offsetWidth;active.classList.add('tab-enter');}}
for(const panel of [remapPanel,advancedPanel])panel.querySelector('[data-action="programming-back"]').onclick=()=>navigateUI('home');
// Keyboard selection also targets Programming and Single Light controls.
$('keyboard').addEventListener('click',event=>{
 const key=event.target.closest('.key');if(!key||busy)return;
 if(uiPage==='programming')syncProgrammingSelection();
 if(uiPage==='lighting'){
 const select=$('single-keys');for(const option of select.options)option.selected=(event.ctrlKey||event.shiftKey)?(option.value===key.dataset.id?!option.selected:option.selected):option.value===key.dataset.id;
 select.dispatchEvent(new Event('change'));
 }
});
window.m6UI={navigate:navigateUI,lightingTab,programmingTab,refresh:()=>{if(!busy){loadProfile();}},snapshot:()=>({busy,connected:!!profile,layer,selectedLabel:profile?.layout.find(k=>k.id===selectedId)?.label||'Select a key',page:uiPage,back:lightingState,under:underLightState,single:singleState,brightness:lightingSavedBrightness})};
navigateUI('home');
// Initial reads can be in flight when the shell mounts.
document.body.dataset.page='home';homePanel.hidden=false;hePanel.hidden=true;presetPanel.hidden=true;programmingLayout.hidden=true;selectionBar.hidden=true;profileBar.hidden=true;lightingTabs.hidden=true;keyStateSummary.hidden=true;document.querySelector('.key-legend').hidden=true;
lightingTab('back');
programmingTabs.hidden=true;programmingTab('Remap');

function syncProgrammingSelection(){
 if(!profile||!programming)return;
 for(const id of ['remap-source','modify-source','media-source','layer-source','dks-source','hotkey-source','pair-first']){
  const select=$(id);select.value=selectedId;select.dispatchEvent(new Event('change'));
 }
}
$('select-multiple').hidden=true;
selectionBar.querySelector('p').textContent='Click keys to add or remove them from the selection. Drag across keys to select a group. Apply changes only the selected switches.';
for(const id of ['remap-source','modify-source','media-source','layer-source','dks-source','hotkey-source','pair-first','modify-target'])$(id).closest('label').hidden=true;
$('key-enabled').closest('label')?.classList.add('toggle-row');
// Drag paints the physical keys; single clicks retain the normal toggle behavior.
let drag=null,suppressClick=false;
$('keyboard').addEventListener('pointerdown',e=>{const key=e.target.closest('.key');if(uiPage!=='range'||busy||e.button!==0||!key)return;drag={id:key.dataset.id,x:e.clientX,y:e.clientY,ids:new Set([key.dataset.id]),active:false};});
window.addEventListener('pointermove',e=>{
 if(!drag||busy)return;
 if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.active=true;
 if(!drag.active)return;
 const key=document.elementFromPoint(e.clientX,e.clientY)?.closest('#keyboard .key');if(key)drag.ids.add(key.dataset.id);
 selectedId=drag.id;selectedIds=new Set(drag.ids);refreshSelection();
});
window.addEventListener('pointerup',()=>{if(drag?.active){suppressClick=true;showSelected();setTimeout(()=>{suppressClick=false;},0);}drag=null;});
window.addEventListener('pointercancel',()=>{drag=null;});
$('keyboard').addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
