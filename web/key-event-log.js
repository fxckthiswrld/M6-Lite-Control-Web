(function(root){
  'use strict';
  class KeyEventLog {
    constructor(limit=2000){this.limit=limit;this.clear();}
    clear(){this.events=[];this.held=new Set();this.active=false;this.dropped=0;this.sequence=0;}
    append(event){this.events.push({...event,sequence:++this.sequence});if(this.events.length>this.limit){this.events.shift();this.dropped++;}}
    start(time,context={}){this.held.clear();this.active=true;this.append({...context,type:'start',time});}
    stop(reason,time){if(!this.active)return;this.append({type:'stop',reason,time,unreleased:[...this.held]});this.held.clear();this.active=false;}
    accept(type,event,time){
      if(!this.active||!['keydown','keyup'].includes(type))return;
      const code=event.code||'Unidentified',wasHeld=this.held.has(code);
      if(type==='keydown')this.held.add(code);else this.held.delete(code);
      this.append({type,code,time,repeat:!!event.repeat,unmatchedRelease:type==='keyup'&&!wasHeld,
        ctrl:!!event.ctrlKey,alt:!!event.altKey,shift:!!event.shiftKey,meta:!!event.metaKey});
    }
    snapshot(){return {format:'m6-key-events',version:1,source:'focused-window-key-events',identifiesDevice:false,
      active:this.active,held:[...this.held],dropped:this.dropped,events:this.events.map(e=>({...e,...(e.unreleased?{unreleased:[...e.unreleased]}:{})}))};}
  }
  if(typeof module==='object'&&module.exports)module.exports={KeyEventLog};else root.KeyEventLog=KeyEventLog;
})(globalThis);
