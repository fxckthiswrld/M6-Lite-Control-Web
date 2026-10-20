'use strict';
(function(){
  const secureContext=window.isSecureContext;
  const webhid=!!(navigator.hid&&typeof navigator.hid.requestDevice==='function'&&typeof navigator.hid.getDevices==='function');
  const supported=secureContext&&webhid;
  const screen=document.createElement('div');
  screen.id='boot-screen';
  screen.className='boot-screen';
  screen.setAttribute('role','dialog');
  screen.setAttribute('aria-modal','true');
  const card=document.createElement('section');
  card.className='boot-card';
  screen.append(card);
  let watchTimer=null,hidden=false;

  function addBrand(){
    const header=document.createElement('div');header.className='boot-brand';
    const image=document.createElement('img');image.src='logo256.ico';image.alt='';image.width=46;image.height=46;
    const name=document.createElement('div');name.className='boot-brand-name';
    name.append(document.createTextNode('M6 '));
    const plus=document.createElement('span');plus.textContent='LITE+';name.append(plus);
    const label=document.createElement('small');label.textContent='CONTROL SOFTWARE';
    name.append(label);
    header.append(image,name);card.append(header);
  }

  function addTitle(text){const title=document.createElement('h1');title.className='boot-title';title.textContent=text;card.append(title);return title;}

  function addText(text,className='boot-text'){const paragraph=document.createElement('p');paragraph.className=className;paragraph.textContent=text;card.append(paragraph);return paragraph;}

  function isConnected(){
    try{return !!window.m6UI?.snapshot?.().connected;}catch{return false;}
  }

  function hideBoot(){
    if(hidden)return;
    hidden=true;
    if(watchTimer){clearInterval(watchTimer);watchTimer=null;}
    document.body.classList.remove('boot-locked');
    screen.classList.add('boot-screen--hidden');
    setTimeout(()=>screen.remove(),220);
  }

  function watchForConnection(){
    watchTimer=setInterval(()=>{if(isConnected())hideBoot();},400);
  }

  function renderUnsupported(){
    document.body.dataset.bootState='unsupported';
    addBrand();
    addTitle('Your browser is not supported');
    addText('This app needs WebHID to communicate with your keyboard. Open it in Google Chrome or Microsoft Edge on a desktop computer.');
    addText('WebHID also requires HTTPS or localhost. Firefox, Safari and mobile browsers cannot run this app.','boot-note');
    const badges=document.createElement('div');badges.className='boot-badges';
    for(const name of ['Google Chrome','Microsoft Edge']){const badge=document.createElement('span');badge.textContent=name;badges.append(badge);}
    card.append(badges);
  }

  function renderConnect(){
    document.body.dataset.bootState='connect';
    addBrand();
    addTitle('Connect your keyboard');
    addText('Plug in your M6 Lite+ over USB and choose it in the browser prompt. Changes are saved to the keyboard automatically.');
    addText('Already paired? We are checking for it automatically.','boot-note');
    const status=document.createElement('p');status.className='boot-status';status.id='boot-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const button=document.createElement('button');button.type='button';button.className='boot-button';button.id='boot-connect';button.textContent='Connect keyboard';
    const note=document.createElement('p');note.className='boot-note boot-note--small';note.textContent='Requires Google Chrome or Microsoft Edge. WebHID needs HTTPS or localhost.';
    const setStatus=(message,tone='')=>{status.textContent=message;status.dataset.tone=tone;};
    setStatus('Looking for a paired keyboard...','pending');
    const checkTimer=setTimeout(()=>{if(!hidden&&!isConnected())setStatus('No paired keyboard found. Connect your keyboard to continue.');},3000);
    button.onclick=async()=>{
      if(button.disabled)return;
      clearTimeout(checkTimer);
      button.disabled=true;
      setStatus('Opening the browser device picker...','pending');
      try{
        if(!window.keyboard?.connect)throw new Error('The keyboard bridge is not ready. Reload the page and try again.');
        const reply=await window.keyboard.connect();
        if(!reply?.ok)throw new Error(reply?.error||'The keyboard was not connected.');
        setStatus('Connected. Reading keyboard...','ok');
        await window.m6UI?.refresh?.();
        const deadline=Date.now()+6000;
        while(Date.now()<deadline&&!isConnected())await new Promise(resolve=>setTimeout(resolve,150));
        if(isConnected())hideBoot();
        else{setStatus('Connected, but the keyboard did not respond. Try again.','error');button.disabled=false;}
      }catch(error){
        setStatus(error?.message||String(error),'error');
        button.disabled=false;
      }
    };
    card.append(status,button,note);
    window.addEventListener('m6-device-status',event=>{if(event.detail?.phase==='connected'&&isConnected())hideBoot();});
  }

  document.body.append(screen);
  if(!supported){renderUnsupported();return;}
  renderConnect();
  watchForConnection();
})();
