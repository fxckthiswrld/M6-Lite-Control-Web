'use strict';
// Safety net for cached bundles: hide removed headings and relabel the studio footer.
(function(){
  const FOOTER_OLD='M.M STUDIO \xB7 M6 LITE+';
  const FOOTER_NEW='MMSTUDIO \xB7 M6 LITE+';
  const REMOVED_DESCRIPTIONS=new Set([
    'A familiar layout. A more personal setup.',
    'Tune every switch to the way you play.',
    'Every key can do more.',
    'Three independent layers. One keyboard.'
  ]);
  const style=document.createElement('style');
  style.textContent='.page-heading .eyebrow{display:none!important}'
    +'body[data-page=home] .page-heading p,body[data-page=range] .page-heading p,body[data-page=programming] .page-heading p,body[data-page=lighting] .page-heading p,body[data-page=settings] .page-heading p{display:none!important}';
  (document.head||document.documentElement).append(style);

  function apply(){
    for(const footer of document.querySelectorAll('.sidebar-foot')){
      if(footer.textContent.trim()===FOOTER_OLD)footer.textContent=FOOTER_NEW;
    }
    for(const paragraph of document.querySelectorAll('.page-heading p')){
      if(REMOVED_DESCRIPTIONS.has(paragraph.textContent.trim()))paragraph.style.display='none';
    }
  }

  apply();
  const target=document.getElementById('app-shell')||document.body;
  new MutationObserver(apply).observe(target,{childList:true,subtree:true,characterData:true});
  window.addEventListener('m6-page',apply);
})();
