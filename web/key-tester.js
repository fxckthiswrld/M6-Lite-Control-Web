'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.id='key-tester';
 dialog.innerHTML='<div class="tester-head"><h2>Keyboard Tester</h2><button id="tester-close" class="tester-close secondary" aria-label="Close keyboard tester" title="Close">×</button></div><iframe class="upstream-keyboard-tester" src="keyboard-tester/index.html" title="Keyboard Tester"></iframe>';
 document.body.appendChild(dialog);
 const button=document.createElement('button');button.id='open-key-tester';button.className='secondary';button.textContent='Keyboard Tester';document.querySelector('.advanced-panel').prepend(button);
 const applyTheme=()=>{try{const doc=dialog.querySelector('iframe').contentDocument;if(!doc)return;const style=doc.createElement('style');style.textContent='@font-face{font-family:Manrope;src:url("../fonts/manrope-latin.woff2") format("woff2");font-weight:400 800;font-display:swap}html,body{background:#18181b!important;color:#f4f4f5!important;font-family:Manrope,ui-sans-serif,system-ui,sans-serif!important}header,footer{color:#f4f4f5!important}.intro,.theme-and-layout,.footer{display:none!important}.keyboard{margin:12px auto!important;transform:none!important}.key{font-weight:700!important}';doc.head.appendChild(style);const slider=doc.getElementById('layoutSlider');if(slider){slider.value='1';slider.dispatchEvent(new Event('input'));slider.parentElement?.parentElement?.remove();}}catch(error){console.warn('Keyboard Tester theme unavailable',error.message);}};
 dialog.querySelector('iframe').addEventListener('load',applyTheme);button.onclick=()=>{if(busy)return;dialog.showModal();applyTheme();};dialog.querySelector('#tester-close').onclick=()=>dialog.close();dialog.addEventListener('cancel',()=>dialog.close());
})();


