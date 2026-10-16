const VID=0x2233,PID=0x006b;
const out=Uint8Array.from('8e96ce6af272994858612758e89a7f0195eeed2f'.match(/../g),x=>parseInt(x,16));
const input=Uint8Array.from('6a6d64663f2ef0430a41ea8f2bfce0e7d5527ba5'.match(/../g),x=>parseInt(x,16));
const xor=(a,m)=>Uint8Array.from(a,(v,i)=>v^m[i]);
const u16=(a,i)=>a[i]|a[i+1]<<8;
export class M6Hid{
 constructor(){this.device=null}
 get connected(){return !!this.device?.opened}
 async connect(){if(!navigator.hid)throw Error('WebHID недоступен. Используйте Chrome или Edge на localhost/HTTPS.');const list=await navigator.hid.requestDevice({filters:[{vendorId:VID,productId:PID}]});if(!list.length)throw Error('Устройство не выбрано.');this.device=list[0];await this.device.open();return this.device}
 async send(payload){if(!this.connected)throw Error('Сначала подключите клавиатуру.');await this.device.sendReport(4,xor(payload,out))}
 async transfer(kind){if(!this.connected)throw Error('Сначала подключите клавиатуру.');const d=this.device;return new Promise(async(resolve,reject)=>{let total=null,parts=new Map();const done=()=>{clearTimeout(timer);d.removeEventListener('inputreport',on)};const timer=setTimeout(()=>{done();reject(Error('Тайм-аут чтения профиля.'))},4000);const on=e=>{if(e.reportId!==4)return;const a=new Uint8Array(e.data.buffer,e.data.byteOffset,e.data.byteLength);const p=xor(a,input);if(p[0]!==8||p[1]!==0||p[2]!==kind)return;total??=u16(p,3);parts.set(u16(p,5),p.slice(8));if(parts.size===total){done();const all=new Uint8Array(total*12);for(let n=1;n<=total;n++)all.set(parts.get(n),(n-1)*12);resolve(all)}};d.addEventListener('inputreport',on);try{const p=new Uint8Array(20);p.set([8,0,kind]);await this.send(p)}catch(e){done();reject(e)}})}
 async profile(layer){const raw=await this.transfer(25+layer);if(raw.length<984)throw Error('Неполный профиль клавиатуры.');const fields=['head','trigger','release','fixedDown','fixedUp','bottom'];const keys=[];for(let n=0;n<70;n++){const o=n*14,k={row:n/14|0,col:n%14,rtOn:!!raw[o]};fields.forEach((f,i)=>k[f]=u16(raw,o+2+i*2)/500);keys.push(k)}return {layer,keys}}
 async write(key,layer){const p=new Uint8Array(20);p.set([8,0x31,1,layer,key.row,key.col,key.rtOn?1:0]);['head','trigger','release','fixedDown','fixedUp','bottom'].forEach((f,i)=>{const v=Math.round(key[f]*500);p[7+i*2]=v&255;p[8+i*2]=v>>8});await this.send(p)}
 async save(){const p=new Uint8Array(20);p.set([8,0xf2]);await this.send(p)}
}
