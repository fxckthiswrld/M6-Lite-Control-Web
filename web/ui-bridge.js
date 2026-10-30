'use strict';
// Adapt the existing verified controllers without duplicating USB state in React.
const originalNavigation=[...document.querySelectorAll('aside .nav')];
document.querySelector('aside').id='legacy-navigation';
const homePanel=document.createElement('section');homePanel.id='home-content';document.querySelector('main').append(homePanel);
const selectedKeyCard=document.querySelector('.panel-head .selected-switch')?.parentElement;if(selectedKeyCard)selectedKeyCard.style.display='none';
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
function programmingTab(tab){if(busy)return;fillRemap();fillLayer();fillMedia();fillModify();fillHotKey();showPairState();showDksState();syncProgrammingSelection();programmingView=tab;for(const [name,nodes] of Object.entries(programmingGroups))for(const node of nodes)node.hidden=false;showProgrammingGroup(programmingGroup);
 if(uiPage==='programming'){remapPanel.hidden=false;advancedPanel.hidden=false;for(const panel of [remapPanel,advancedPanel]){panel.classList.remove('tab-enter');void panel.offsetWidth;panel.classList.add('tab-enter');}}
}
const programmingLayout=document.createElement('div');programmingLayout.id='programming-layout';
const programmingHelp=document.createElement('section');programmingHelp.className='programming-help-card';programmingHelp.innerHTML='<small>PROGRAMMING</small><h3>Program your keys</h3><p>Select a physical key on the keyboard above, then choose its action in one of the panels.</p><p>Each panel expands to show the available settings. Changes are written automatically and verified on the keyboard.</p><div class="programming-help-step"><b>1</b><span>Select a source key above</span></div><div class="programming-help-step"><b>2</b><span>Choose an action or target key</span></div><div class="programming-help-step"><b>3</b><span>The setting is written and read back automatically</span></div>';
const programmingWorkspace=document.createElement('div');programmingWorkspace.className='programming-workspace';
const programmingOverview=document.createElement('div');programmingOverview.className='programming-overview';
const programmingGroupBar=document.createElement('div');programmingGroupBar.className='programming-group-bar';programmingGroupBar.setAttribute('role','tablist');programmingGroupBar.setAttribute('aria-label','Programming group');
const programmingPanels=document.createElement('div');programmingPanels.className='programming-group-panels';
programmingWorkspace.append(programmingOverview,programmingGroupBar,programmingPanels);
const programmingSide=document.createElement('div');programmingSide.className='programming-side';programmingSide.append(programmingHelp);programmingLayout.append(programmingSide,programmingWorkspace);remapPanel.before(programmingLayout);programmingWorkspace.append(remapPanel,advancedPanel);
const programmingGroupPanels={},programmingGroupButtons={};
for(const name of ['Remap','DKS','Snap']){
 const panel=document.createElement('div');panel.className='programming-group-panel';panel.dataset.group=name;programmingPanels.append(panel);programmingGroupPanels[name]=panel;
 const button=document.createElement('button');button.type='button';button.dataset.group=name;button.setAttribute('role','tab');button.textContent=name;button.onclick=()=>showProgrammingGroup(name);programmingGroupBar.append(button);programmingGroupButtons[name]=button;
}
let programmingGroup='Remap',programmingSlot=null;
function setProgrammingSlot(id){
 programmingSlot=programmingSlot===id?null:id;
 for(const slot of document.querySelectorAll('.programming-slot')){
  const target=slot.dataset.dksSlot?`dks-${slot.dataset.dksSlot}`:slot.dataset.pairSlot?`pair-${slot.dataset.pairSlot}`:null;
  slot.classList.toggle('picking',target===programmingSlot);
 }
 const dksHint=$('dks-slot-hint'),pairHint=$('pair-slot-hint');
 if(dksHint)dksHint.textContent=programmingSlot?.startsWith('dks-')?'Tap a key on the keyboard above to assign it. Click the slot again to cancel.':'';
 if(pairHint)pairHint.textContent=programmingSlot?.startsWith('pair-')?'Tap a key on the keyboard above to assign it. Click the slot again to cancel.':'';
}
function showProgrammingGroup(name){
 if(!programmingGroupPanels[name])name='Remap';programmingGroup=name;
 for(const [key,panel] of Object.entries(programmingGroupPanels))panel.hidden=key!==name;
 for(const [key,button] of Object.entries(programmingGroupButtons))button.setAttribute('aria-pressed',String(key===name));
}
const presetCard=document.createElement('details');presetCard.className='programming-card';presetCard.open=true;const presetSummary=document.createElement('summary');presetSummary.textContent='Quick presets';presetCard.append(presetSummary,presetPanel);programmingOverview.append(presetCard);
let enableCard=null;
for(const [name,nodes] of Object.entries(programmingGroups)){
 if(name==='Off / Enable key'){
  const resetCard=document.createElement('section');resetCard.className='programming-off-card programming-reset-card';resetCard.dataset.programmingGroup=name;
  const resetHeading=document.createElement('h3');resetHeading.textContent='Reset keys';resetCard.append(resetHeading);
  enableCard=document.createElement('details');enableCard.className='programming-card';enableCard.open=false;const enableSummary=document.createElement('summary');enableSummary.textContent='Enable key';enableCard.append(enableSummary);
  for(const node of nodes){
   if(node.tagName==='H2'){node.remove();continue;}
   node.hidden=false;
   if(node.id==='programming-reset'||node.querySelector?.('#programming-reset'))resetCard.append(node);
   else if(node.tagName==='P'&&/Off disables the source switch/.test(node.textContent)){node.textContent='Enable or disable the source switch. The saved assignment is retained while disabled.';enableCard.append(node);}
   else enableCard.append(node);
  }
  resetCard.insertAdjacentHTML('beforeend','<button id="programming-reset-all" class="secondary">Reset all keys to Standard</button><p id="programming-reset-all-status" role="status"></p>');
  resetCard.querySelector('#programming-reset-all').onclick=async()=>{
   if(busy||!programming)return;
   if(!window.confirm('Reset all programming assignments for this profile to Standard?\n\nA backup will be kept, but automatic undo is unavailable.'))return;
   setBusy(true);$('programming-reset-all-status').textContent='Resetting all keys...';
   try{
    const reply=await window.keyboard.resetAllProgramming({layer});
    if(!reply.ok)throw new Error(reply.error);
    programming=reply.result;
    fillRemap();fillLayer();fillMedia();fillModify();fillHotKey();showPairState();showDksState();syncProgrammingSlots();updateProgrammingIndicators();
    $('programming-reset-all-status').textContent=`Reset ${reply.result.resetCount} keys to Standard. Backup: ${reply.result.backup}`;
   }catch(error){$('programming-reset-all-status').textContent=error.message;}
   finally{setBusy(false);}
  };
  programmingSide.append(resetCard);
  continue;
 }
 const card=document.createElement('details');card.className='programming-card';card.dataset.programmingGroup=name;const summary=document.createElement('summary');summary.textContent=name==='Layer assignment'?'FN / Layer assignment':name==='Snap Tap / SOCD'?'Snap Tap / SOCD':name;card.append(summary);for(const node of nodes){if(node.tagName==='H2')node.hidden=true;node.hidden=false;card.append(node);}programmingCards[name]=card;
}
for(const name of ['Remap','Layer assignment','Media'])programmingGroupPanels.Remap.append(programmingCards[name]);
if(enableCard)programmingGroupPanels.Remap.append(enableCard);
const dksCard=programmingCards['DKS'];if(dksCard){dksCard.open=true;programmingGroupPanels.DKS.append(dksCard);}
const snapCard=programmingCards['Snap Tap / SOCD'];if(snapCard){snapCard.open=true;programmingGroupPanels.Snap.append(snapCard);}
const hotkeyCard=programmingCards.HotKey;if(hotkeyCard){hotkeyCard.hidden=true;programmingGroupPanels.Remap.append(hotkeyCard);}
showProgrammingGroup('Remap');
function programmingKeyLabel(id){return profile?.layout.find(key=>key.id===id)?.label||id;}
function syncProgrammingSlots(){
 const source=$('dks-source')?.value,target=$('dks-target')?.value;
 if($('dks-source-box')){$('dks-source-box').textContent=source?programmingKeyLabel(source):'Assign';$('dks-source-box').parentElement.classList.toggle('assigned',!!source);}
 if($('dks-target-box')){const text=target?(target.startsWith('mouse:')?target.slice(6):programmingKeyLabel(target)):'Assign';$('dks-target-box').textContent=text;$('dks-target-box').parentElement.classList.toggle('assigned',!!target);}
 const first=$('pair-first')?.value,second=$('pair-second')?.value;
 if($('pair-first-box')){$('pair-first-box').textContent=first?programmingKeyLabel(first):'Assign';$('pair-first-box').parentElement.classList.toggle('assigned',!!first);}
 if($('pair-second-box')){$('pair-second-box').textContent=second?programmingKeyLabel(second):'Assign';$('pair-second-box').parentElement.classList.toggle('assigned',!!second);}
 const mode=$('pair-mode')?.value;for(const button of document.querySelectorAll('[data-pair-mode]'))button.setAttribute('aria-pressed',String(button.dataset.pairMode===mode));
}
function renderProgrammingSlots(){
 const dksCard=programmingCards['DKS'],snapCard=programmingCards['Snap Tap / SOCD'];
 if(dksCard&&!dksCard.querySelector('.programming-slot-grid')){
  const intro=dksCard.querySelector('p');
  if(intro){intro.textContent='Pick a source key and one DKS target. The target repeats at the selected interval while the source is held.';intro.classList.add('programming-group-note');dksCard.parentElement.insertBefore(intro,dksCard);}
  const controls=dksCard.querySelector('.controls');
  controls.insertAdjacentHTML('beforebegin','<div class="programming-slot-grid"><button type="button" class="programming-slot" data-dks-slot="source"><span>Key 1 · Source</span><b id="dks-source-box">Assign</b></button><button type="button" class="programming-slot" data-dks-slot="target"><span>Key 2 · Target</span><b id="dks-target-box">Assign</b></button></div><p class="programming-slot-hint" id="dks-slot-hint" role="status"></p><div class="programming-preset-row"><span>Preset bindings</span>'+['W','A','S','D'].map(label=>'<button type="button" data-dks-preset="'+label+'">'+label+'</button>').join('')+'</div>');
  for(const slot of dksCard.querySelectorAll('[data-dks-slot]'))slot.onclick=()=>setProgrammingSlot('dks-'+slot.dataset.dksSlot);
  for(const button of dksCard.querySelectorAll('[data-dks-preset]'))button.onclick=()=>{const key=profile?.layout.find(item=>(item.label||'').toUpperCase()===button.dataset.dksPreset);if(!key)return;$('dks-target').value=key.id;$('dks-target').dispatchEvent(new Event('change'));syncProgrammingSlots();};
 }
 if(snapCard&&!snapCard.querySelector('.programming-slot-grid')){
  const controls=snapCard.querySelector('.controls'),intro=snapCard.querySelector('p');
  if(intro){intro.classList.add('programming-group-note');snapCard.parentElement.insertBefore(intro,snapCard);}
  controls.insertAdjacentHTML('beforebegin','<div class="programming-slot-grid"><button type="button" class="programming-slot" data-pair-slot="first"><span>Key 1</span><b id="pair-first-box">Assign</b></button><button type="button" class="programming-slot" data-pair-slot="second"><span>Key 2</span><b id="pair-second-box">Assign</b></button></div><p class="programming-slot-hint" id="pair-slot-hint" role="status"></p><div class="programming-mode-row"><button type="button" data-pair-mode="5">Snap Tap</button><button type="button" data-pair-mode="6">SOCD / AD Cancel</button></div>');
  $('pair-mode').closest('label').style.setProperty('display','none');
  $('pair-second').closest('label').style.setProperty('display','none');
  for(const slot of snapCard.querySelectorAll('[data-pair-slot]'))slot.onclick=()=>setProgrammingSlot('pair-'+slot.dataset.pairSlot);
  for(const button of snapCard.querySelectorAll('[data-pair-mode]'))button.onclick=()=>{$('pair-mode').value=button.dataset.pairMode;syncProgrammingSlots();if($('pair-first').value&&$('pair-second').value)setTimeout(()=>$('pair-apply').click(),50);};
 }
 for(const id of ['dks-source','dks-target','pair-first','pair-second','pair-mode'])$(id)?.addEventListener('change',syncProgrammingSlots);
 for(const id of ['dks-apply','dks-disable','pair-apply','pair-disable'])$(id)?.addEventListener('click',()=>setTimeout(syncProgrammingSlots,50));
 syncProgrammingSlots();
}
renderProgrammingSlots();
const mediaSelect=$('media-action');
if(mediaSelect){
 const mediaLabel=mediaSelect.closest('label');if(mediaLabel)mediaLabel.hidden=true;mediaSelect.hidden=true;
 const picker=document.createElement('div');picker.id='media-icon-picker';mediaLabel.after(picker);
 const render=()=>{picker.replaceChildren();for(const action of window.keyboard.mediaActions||[]){const button=document.createElement('button');button.type='button';button.className='media-icon-button';button.dataset.mediaAction=action.id;button.title=action.label;button.setAttribute('aria-label',action.label);button.innerHTML=`<span>${window.M6_MEDIA_ICONS?.[action.id]||'•'}</span><small>${action.label}</small>`;button.onclick=()=>{mediaSelect.value=action.id;mediaSelect.dispatchEvent(new Event('change',{bubbles:true}));};picker.append(button);}sync();};
 const sync=()=>{for(const button of picker.querySelectorAll('.media-icon-button'))button.classList.toggle('selected',button.dataset.mediaAction===mediaSelect.value);};
 mediaSelect.addEventListener('change',sync);new MutationObserver(render).observe(mediaSelect,{childList:true});render();
}
const keyLibrary=document.createElement('section');keyLibrary.id='key-library';keyLibrary.innerHTML='<div class="key-library-head"><input id="key-search" type="search" placeholder="Search for a character" aria-label="Search for a character"></div><div id="key-library-categories"></div>';
const remapLibraryLayout=document.createElement('div');remapLibraryLayout.id='remap-library-layout';
const remapLibrarySide=document.createElement('aside');remapLibrarySide.className='remap-library-side';remapLibrarySide.innerHTML='<h3>Remap keys</h3><p>Changes made here affect this profile. Select a physical key above, then pick its target on the right.</p><div class="remap-pair-preview"><div class="remap-pair-key"><small>ORIGINAL</small><b id="remap-original-key">—</b></div><span class="remap-pair-arrow">→</span><div class="remap-pair-key"><small>REPLACEMENT</small><b id="key-library-selected">—</b></div></div><p id="key-library-status" role="status"></p>';
remapLibraryLayout.append(remapLibrarySide,keyLibrary);$('remap-current').before(remapLibraryLayout);
function keyCategory(label){return label.length===1&&/[A-Z0-9`~!@#$%^&*()_+\-=\[\]{}\\|;:'",.<>/?]/i.test(label)?'Basic Characters':'Extended Characters';}
function syncKeyLibrary(){const value=$('remap-target')?.value,sourceId=$('remap-source')?.value||selectedId,source=profile?.layout.find(key=>key.id===sourceId),sourceKey=programming?.keys.find(key=>`${key.row}:${key.col}`===sourceId),mouse=sourceKey?.modify?.type===1?mouseActionFor(sourceKey.modify):null,option=$('remap-target')?.selectedOptions?.[0],original=$('remap-original-key'),preview=$('key-library-selected');for(const button of keyLibrary.querySelectorAll('.key-library-button')){if(button.dataset.mouseAction)button.classList.toggle('selected',button.dataset.mouseAction===mouse);else button.classList.toggle('selected',button.dataset.target===value);}if(original)original.textContent=source?.label||'—';if(preview)preview.textContent=mouse?(window.M6_MOUSE_ACTIONS?.[mouse]?.label||'Mouse'):(option&&value?option.textContent:'—');}
async function applyMouseTarget(id){if(busy||!programming)return;const action=window.M6_MOUSE_ACTIONS?.[id];if(!action)return;const source=$('modify-source')?.value||selectedId;setBusy(true);$('key-library-status').textContent='Applying...';try{const reply=await window.keyboard.setModify({layer,id:source,modify:{type:1,row:0,col:0,button:action.button,x:action.x,y:action.y,wheel:action.wheel,mode:0,interval:0}});if(!reply.ok)throw new Error(reply.error);programming=reply.result;fillModify();updateProgrammingIndicators();$('key-library-status').textContent=action.label+' applied.';syncKeyLibrary();}catch(error){$('key-library-status').textContent=error.message;}finally{setBusy(false);}}
function renderKeyLibrary(){const host=$('key-library-categories'),groups=new Map();for(const [r,row] of (window.M6_FULL_SIZE_KEYBOARD||[]).entries())for(const [c,label] of row.entries())if(label){const category=keyCategory(label);if(!groups.has(category))groups.set(category,[]);groups.get(category).push({r,c,label});}host.replaceChildren();for(const name of ['Basic Characters','Extended Characters']){const items=groups.get(name);if(!items)continue;const section=document.createElement('details');section.className='key-library-category';section.open=true;const summary=document.createElement('summary');summary.textContent=(name==='Basic Characters'?'A  ':'#  ')+name;const grid=document.createElement('div');grid.className='key-library-grid';for(const item of items){const button=document.createElement('button');button.type='button';button.className='key-library-button';button.dataset.target=`key:${item.r}:${item.c}`;button.dataset.label=item.label;button.textContent=item.label;button.title=`${item.label} (${item.r+1}:${item.c+1})`;button.onclick=()=>{for(const id of ['remap-target','modify-target']){const select=$(id);if(select){select.value=button.dataset.target;}}syncKeyLibrary();if(!busy&&$('remap-apply')&&!$('remap-apply').disabled)$('remap-apply').click();};grid.append(button);}section.append(summary,grid);host.append(section);}const mouse=document.createElement('details');mouse.className='key-library-category';mouse.open=true;const summary=document.createElement('summary');summary.textContent='🖱  Mouse';const grid=document.createElement('div');grid.className='key-library-grid mouse-key-library';for(const id of ['left-button','right-button','middle-button']){const action=window.M6_MOUSE_ACTIONS?.[id];if(!action)continue;const button=document.createElement('button');button.type='button';button.className='key-library-button mouse-key-button';button.dataset.mouseAction=id;button.title=action.label;button.setAttribute('aria-label',action.label);button.innerHTML=window.M6_MOUSE_SVG?.[id]||'';button.onclick=()=>applyMouseTarget(id);grid.append(button);}mouse.append(summary,grid);host.append(mouse);syncKeyLibrary();}
$('key-search').addEventListener('input',()=>{const query=$('key-search').value.trim().toLowerCase();for(const section of keyLibrary.querySelectorAll('.key-library-category')){let visible=0;for(const button of section.querySelectorAll('.key-library-button')){const show=!query||(button.dataset.label||button.title||'').toLowerCase().includes(query);button.hidden=!show;if(show)visible++;}section.hidden=visible===0;}});
$('remap-target').addEventListener('change',syncKeyLibrary);renderKeyLibrary();
function programmingIconLabel(text){const value=String(text||'').trim();if(value.length<=3)return value;const abbreviations={'Backspace':'BACK','Print Screen':'PRT SC','Scroll Lock':'SLK','Pause':'PAUSE','Insert':'INS','Delete':'DEL','Home':'HOME','End':'END','Page Up':'PG UP','Page Down':'PG DN','Num Lock':'NUM','Num /':'NUM /','Num *':'NUM *','Num -':'NUM -','Num +':'NUM +','Num 7':'NUM 7','Num 8':'NUM 8','Num 9':'NUM 9','Num 4':'NUM 4','Num 5':'NUM 5','Num 6':'NUM 6','Num 1':'NUM 1','Num 2':'NUM 2','Num 3':'NUM 3','Num 0':'NUM 0','Num .':'NUM .','Num Enter':'NUM ENT','Caps Lock':'CAPS','Left Shift':'L-SH','Right Shift':'R-SH','Left Ctrl':'L-CTRL','Right Ctrl':'R-CTRL','Left Alt':'L-ALT','Right Alt':'R-ALT','Left Win':'L-WIN','Right Win':'R-WIN','Left Arrow':'←','Down Arrow':'↓','Up Arrow':'↑','Right Arrow':'→'};if(abbreviations[value])return abbreviations[value];const icons=[['media','♫'],['mouse','🖱'],['wheel','↕'],['snap','⇄'],['socd','⇄'],['dks','⌘'],['fn','Fn'],['layer','▱'],['reset','↺'],['disable','⏻'],['standard','⌨'],['keyboard','⌨'],['hotkey','⟳']];const match=icons.find(([word])=>value.toLowerCase().includes(word));return match?.[1]||value.slice(0,6).toUpperCase();}
const fullSizeKeyboardKeys=['Esc','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12','Print Screen','Scroll Lock','Pause','1','2','3','4','5','6','7','8','9','0','-','=', 'Backspace','Insert','Home','Page Up','Num Lock','Num /','Num *','Num -','Tab','Q','W','E','R','T','Y','U','I','O','P','[',']','\\','Delete','End','Page Down','Num 7','Num 8','Num 9','Num +','Caps Lock','A','S','D','F','G','H','J','K','L',';','\'','Enter','Num 4','Num 5','Num 6','Left Shift','Z','X','C','V','B','N','M',',','.','/','Right Shift','Num 1','Num 2','Num 3','Num Enter','Left Ctrl','Left Win','Left Alt','Space','Right Alt','Right Win','Menu','Right Ctrl','Left Arrow','Down Arrow','Up Arrow','Right Arrow','Num 0','Num .'];
function renderProgrammingIconPicker(select){
 if(!select||select.dataset.iconPicker==='true')return;
 const picker=document.createElement('div');picker.className='programming-icon-picker';picker.setAttribute('role','listbox');picker.setAttribute('aria-label',select.previousElementSibling?.textContent||'Choose an option');
 const isBasic=value=>/^(ESC|[0-9]|[A-Z]|[=+\-_.;,:'"/\\`\[\]])$/i.test(String(value||'').trim());
 const addButton=(option,parent)=>{const button=document.createElement('button');button.type='button';button.className='programming-icon-option';button.dataset.value=option.value;button.title=option.textContent;button.setAttribute('aria-label',option.textContent);button.textContent=programmingIconLabel(option.textContent);if(option.value===select.value)button.classList.add('selected');button.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));};parent.append(button);};
 const refresh=()=>{picker.replaceChildren();if(select.id==='remap-target'){const physical=[...select.options];for(const [title,options] of [['Basic Characters',physical.filter(option=>isBasic(option.textContent))],['Extended Characters',physical.filter(option=>!isBasic(option.textContent))]]){const section=document.createElement('section');section.className='programming-icon-section';const heading=document.createElement('h4');heading.textContent=title;section.append(heading);const grid=document.createElement('div');grid.className='programming-icon-grid';options.forEach(option=>addButton(option,grid));section.append(grid);picker.append(section);}}else{const grid=document.createElement('div');grid.className='programming-icon-grid';[...select.options].forEach(option=>addButton(option,grid));picker.append(grid);}};
 select.dataset.iconPicker='true';select.classList.add('programming-icon-select');select.after(picker);select.addEventListener('change',refresh);new MutationObserver(refresh).observe(select,{childList:true});refresh();
}
const programmingSourceIds=new Set(['remap-source','remap-target','modify-source','modify-target','modify-type','media-source','media-action','layer-source','dks-source','dks-target','hotkey-source','pair-first','pair-second']);
for(const select of programmingLayout.querySelectorAll('select'))if(select.id!=='media-action'&&!programmingSourceIds.has(select.id))renderProgrammingIconPicker(select);
const settingsFooter=document.createElement('div');settingsFooter.id='settings-footer';settingsPanel.append(settingsFooter);
{
 const settingsHeading=settingsPanel.querySelector('small'),settingsFooterNode=settingsPanel.querySelector('#settings-footer'),settingsOptions=settingsPanel.querySelector('.device-options-grid');
 if(settingsOptions){
  const settingsGrid=document.createElement('div');settingsGrid.className='settings-grid';
  const settingsLeft=document.createElement('div');settingsLeft.className='settings-column';
  const settingsRight=document.createElement('div');settingsRight.className='settings-column settings-column-right';
  for(const node of [...settingsPanel.children])if(node!==settingsOptions&&node!==settingsHeading&&node!==settingsFooterNode)settingsLeft.append(node);
  settingsRight.append(settingsOptions);
  settingsGrid.append(settingsLeft,settingsRight);
  settingsPanel.replaceChildren(...[settingsHeading,settingsGrid,settingsFooterNode].filter(Boolean));
 }
}
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
  const colours=document.createElement('section');colours.className='lighting-colours-card';colours.innerHTML='<h3>Colors</h3>';colours.append(color);
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
   const colours=document.createElement('section');colours.className='lighting-under-colours-card';colours.innerHTML='<h3>Colors</h3>';
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
 // Single Light mirrors the Back/Under composition with Colors and Brightness cards.
 {
  const single=lightingWrappers.single;
  const activeLabel=single.querySelector('#single-active')?.closest('label');
  const activeApply=single.querySelector('#single-active-apply');
  const controls=single.querySelector('#single-keys')?.closest('.controls');
  const read=single.querySelector('#single-read');
  const apply=single.querySelector('#single-apply');
  const disable=single.querySelector('#single-disable');
  const status=single.querySelector('#single-status');
  const note=status?.nextElementSibling;
  const enabledLabel=single.querySelector('#single-enabled')?.closest('label');
  const keysLabel=single.querySelector('#single-keys')?.closest('label');
  const brightnessSection=single.querySelector('#single-brightness')?.closest('.lighting-section');
  if(enabledLabel)enabledLabel.classList.add('toggle-row');
  if(keysLabel)keysLabel.style.display='none';
  if(controls&&brightnessSection){
   const content=document.createElement('div');content.className='lighting-single-content';
   const colours=document.createElement('section');colours.className='lighting-single-colours-card';colours.innerHTML='<h3>Colors</h3>';
   const brightness=document.createElement('section');brightness.className='lighting-single-brightness-card';brightness.innerHTML='<h3>Brightness</h3>';
   [controls,read,apply,disable,status,note].filter(Boolean).forEach(node=>colours.append(node));
   const brightnessTitle=brightnessSection.querySelector('h3');if(brightnessTitle)brightnessTitle.hidden=true;
   brightness.append(brightnessSection);
   const service=document.createElement('div');service.className='single-service-controls';service.hidden=true;service.setAttribute('aria-hidden','true');
   [activeLabel,activeApply].filter(Boolean).forEach(node=>service.append(node));
   content.append(colours,brightness);
   single.replaceChildren(content,service);
  }
 }
}
let currentLightingTab=null;
function clearKeyboardSelection(){
 if(busy)return;
 selectedId='';selectedIds=new Set();
 if(typeof refreshSelection==='function')refreshSelection();
 for(const key of $('keyboard').querySelectorAll('.key'))key.classList.remove('key-selected');
 const select=$('single-keys');
 if(select){let changed=false;for(const option of select.options)if(option.selected){option.selected=false;changed=true;}if(changed)select.dispatchEvent(new Event('change'));}
 for(const id of ['selected','selected-release','selected-trigger']){const element=$(id);if(element)element.textContent='-';}
 if(typeof collapseHeFields==='function')collapseHeFields();
}
let uiPage='home';
function navigateUI(page){
 if(busy)return false;
 const leavingCalibration=uiPage==='calibration'&&page!=='calibration';
 if(typeof resetLightingPreview==='function')resetLightingPreview();
 clearKeyboardSelection();setProgrammingSlot(null);
 discardLightingDraft();showDeviceSettings();showSelected();
 fillRemap();fillLayer();fillMedia();fillModify();fillHotKey();showPairState();showDksState();
 for(const panel of [hePanel,advancedPanel,remapPanel,pendingPanel,calibrationPanel,lightingPanel,settingsPanel])panel.hidden=true;
 uiPage=page;document.body.dataset.page=page;
 homePanel.hidden=page!=='home';presetPanel.hidden=page!=='programming';
 programmingLayout.hidden=page!=='programming';
 profileBar.hidden=!['range','programming'].includes(page);selectionBar.hidden=page!=='range';
 $('keyboard').hidden=['settings','calibration'].includes(page);keyStateSummary.hidden=page!=='programming';
 const calibrationMap=$('calibration-map');if(calibrationMap)calibrationMap.hidden=page!=='calibration';
 document.querySelector('.key-legend').hidden=page!=='range';lightingTabs.hidden=page!=='lighting';
 programmingTabs.hidden=page!=='programming';
 if(page==='home'&&profile&&!busy)loadProfile(layer);
 if(page==='range'){hePanel.hidden=false;if(profile&&!busy)loadProfile(layer);}
 if(page==='programming'){selectedIds=selectedId?new Set([selectedId]):new Set();refreshSelection();programmingTab(programmingView);if(profile&&!busy)loadProfile(layer);}
 if(page==='lighting'){lightingPanel.hidden=false;lightingBrightness();syncSingleKeyHighlights();}
 if(page==='settings'){settingsPanel.hidden=false;deviceSettingsAction();}
 if(page==='calibration'){calibrationPanel.hidden=false;restoreCalibrationState().then(()=>{refreshCalibration(calibrationActive).catch(error=>{if(!calibrationActive)$('calibration-status').textContent=error.message;});});}
 window.dispatchEvent(new CustomEvent('m6-page',{detail:page}));if(leavingCalibration&&typeof cancelCalibrationOnExit==='function')cancelCalibrationOnExit();if(typeof updateLightingPreview==='function')updateLightingPreview();window.scrollTo(0,0);return true;
}
function syncSingleKeyHighlights(){const select=$('single-keys');if(!select)return;const ids=new Set([...select.selectedOptions].map(option=>option.value));for(const key of $('keyboard').querySelectorAll('.key'))key.classList.toggle('key-selected',uiPage==='lighting'&&ids.has(key.dataset.id));}
function lightingTab(tab){if(tab!==currentLightingTab)clearKeyboardSelection();currentLightingTab=tab;if(uiPage==='lighting'&&!busy)discardLightingDraft();for(const [name,nodes] of Object.entries(lightingGroups)){lightingWrappers[name].hidden=name!==tab;for(const node of nodes)node.hidden=false;}const active=lightingGroups[tab]?.[0];if(active){active.classList.remove('tab-enter');void active.offsetWidth;active.classList.add('tab-enter');}syncSingleKeyHighlights();if(typeof updateLightingPreview==='function')updateLightingPreview();}
$('single-keys').addEventListener('change',syncSingleKeyHighlights);
for(const panel of [remapPanel,advancedPanel])panel.querySelector('[data-action="programming-back"]').onclick=()=>navigateUI('home');
// Keyboard selection also targets Programming and Single Light controls.
$('keyboard').addEventListener('click',event=>{
 const key=event.target.closest('.key');if(!key||busy)return;
 if(uiPage==='programming'){
  if(programmingSlot){
   const slot=programmingSlot,select=$(slot);select.value=key.dataset.id;select.dispatchEvent(new Event('change'));
   setProgrammingSlot(null);syncProgrammingSlots();
   if(slot.startsWith('pair-')&&$('pair-first').value&&$('pair-second').value)setTimeout(()=>$('pair-apply').click(),50);
   return;
  }
  syncProgrammingSelection();
 }
 if(uiPage==='lighting'){
 const select=$('single-keys');
 for(const option of select.options)if(option.value===key.dataset.id)option.selected=!option.selected;
 select.dispatchEvent(new Event('change'));
 syncSingleKeyHighlights();
 }
});
document.addEventListener('pointerdown',event=>{
 if(busy||event.button!==0)return;
 if(event.target.closest('button,.key,input,select,textarea,label,a,[role=button],[role=tab]'))return;
 if(event.target.closest('#keyboard,.keyboard'))return;
 clearKeyboardSelection();
});
window.m6UI={navigate:navigateUI,lightingTab,programmingTab,refresh:async()=>{if(busy)return;await loadProfile(layer);const page=document.body.dataset.page;if(page==='lighting')lightingBrightness().catch(()=>{});else if(page==='settings')deviceSettingsAction();else if(page==='calibration')refreshCalibration(true).catch(()=>{});},snapshot:()=>({busy,connected:!!profile,layer,selectedLabel:profile?.layout.find(k=>k.id===selectedId)?.label||'Select a key',page:uiPage,back:lightingState,under:underLightState,single:singleState,brightness:lightingSavedBrightness})};
navigateUI('home');
// Initial reads can be in flight when the shell mounts.
document.body.dataset.page='home';homePanel.hidden=false;hePanel.hidden=true;presetPanel.hidden=true;programmingLayout.hidden=true;selectionBar.hidden=true;profileBar.hidden=true;lightingTabs.hidden=true;keyStateSummary.hidden=true;document.querySelector('.key-legend').hidden=true;
lightingTab('back');
programmingTabs.hidden=true;programmingTab('Remap');

function syncProgrammingSelection(){
 if(!profile||!programming)return;
 syncProgrammingSlots();
 if(!selectedId)return;
 for(const id of ['remap-source','modify-source','media-source','layer-source','hotkey-source']){
  const select=$(id);select.value=selectedId;select.dispatchEvent(new Event('change'));
 }
 syncProgrammingSlots();
}
$('select-multiple').hidden=true;
selectionBar.querySelector('p').textContent='Click keys to add or remove them from the selection. Drag across keys to select a group. Changes write automatically to the selected switches.';
for(const id of ['remap-source','remap-target','modify-source','modify-target','media-source','layer-source','dks-source','dks-target','hotkey-source','pair-first']){const label=$(id)?.closest('label');if(label){label.hidden=true;const controls=label.parentElement;if(controls&&![...controls.children].some(node=>!node.hidden))controls.hidden=true;}}
$('key-enabled').closest('label')?.classList.add('toggle-row');
// Drag paints the physical keys; single clicks retain the normal toggle behavior.
let drag=null,suppressClick=false;
$('keyboard').addEventListener('pointerdown',e=>{const key=e.target.closest('.key');if(!['range','lighting'].includes(uiPage)||busy||e.button!==0||!key)return;const ids=new Set(selectedIds);ids.add(key.dataset.id);drag={id:key.dataset.id,x:e.clientX,y:e.clientY,ids,active:false};});
window.addEventListener('pointermove',e=>{
 if(!drag||busy)return;
 const key=document.elementFromPoint(e.clientX,e.clientY)?.closest('#keyboard .key');
 const distance=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
 if(!drag.active&&distance>14&&(distance>24||(key&&key.dataset.id!==drag.id)))drag.active=true;
 if(!drag.active||!key)return;
 if(uiPage==='lighting'){
  const select=$('single-keys'),option=[...select.options].find(o=>o.value===key.dataset.id);
  if(option&&!option.selected){option.selected=true;select.dispatchEvent(new Event('change'));}
  return;
 }
 drag.ids.add(key.dataset.id);
 selectedId=drag.id;selectedIds=new Set(drag.ids);refreshSelection();
 collapseHeFields();
});
window.addEventListener('pointerup',()=>{if(drag?.active){suppressClick=true;if(uiPage==='range')showSelected();setTimeout(()=>{suppressClick=false;},0);}drag=null;});
window.addEventListener('pointercancel',()=>{drag=null;});
$('keyboard').addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
function hideLegacyRefresh(){
 const footer=document.getElementById('settings-footer');if(!footer)return;
 for(const button of footer.querySelectorAll('button'))if(/refresh/i.test(button.textContent||'')){button.hidden=true;button.style.display='none';}
 const note=[...footer.querySelectorAll('p')].find(node=>/refresh reads/i.test(node.textContent||''));
 if(note)note.remove();
}
setTimeout(hideLegacyRefresh,0);
const settingsFooterNode=document.getElementById('settings-footer');
if(settingsFooterNode)new MutationObserver(hideLegacyRefresh).observe(settingsFooterNode,{childList:true,subtree:true});
