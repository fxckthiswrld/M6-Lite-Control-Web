'use strict';
const {Buffer}=require('buffer');

const CRC_SECTIONS=new Map([
  [0xc1,{kind:2,length:4768}],
  [0xc2,{kind:4,length:4768}],
  [0xc9,{kind:25,length:980}],
  [0xca,{kind:26,length:980}]
]);

function cacheCrc(bytes){
  let crc=0xffffffff;
  for(let offset=0;offset<bytes.length;offset+=4){
    let word=0;
    for(let byte=0;byte<4;byte++)word|=(bytes[offset+byte]||0)<<(byte*8);
    crc^=word;
    for(let bit=0;bit<32;bit++)crc=(crc<<1)^((crc&0x80000000)?0x04c11db7:0);
  }
  return crc>>>0;
}

async function saveDeviceMemory(device,sections,{timeoutMs=5000,requireCrc=false,tolerant=false,trace=()=>{},stream:providedStream=null}={}){
  const tags=new Map();
  for(const [command,{kind,length}] of CRC_SECTIONS){
    const raw=sections.get(kind);
    if(!Buffer.isBuffer(raw)||raw.length<length)throw Error(`Missing device-memory backup (${kind})`);
    tags.set(command,cacheCrc(raw.subarray(0,length)));
  }
  const stream=providedStream||device.openReportStream(),ownsStream=!providedStream;
  try{
    const send=async payload=>{
      trace({direction:'out',hex:Buffer.from(payload).toString('hex')});
      await device.send(payload);
    };
    const start=Buffer.alloc(20);start.set([8,0xf2]);
    await send(start);
    const deadline=Date.now()+timeoutMs,answered=new Set();
    let frames=0;
    while(Date.now()<deadline&&frames<20000){
      const payload=await stream.next(Math.max(1,Math.min(100,deadline-Date.now())));
      if(!payload)continue;
      frames++;
      trace({direction:'in',hex:payload.toString('hex')});
      if(payload[0]===0&&tags.has(payload[1])){
        const reply=Buffer.alloc(20);reply.set([8,payload[1],0]);reply.writeUInt32LE(tags.get(payload[1]),3);
        await send(reply);
        answered.add(payload[1]);
      }else if((payload[0]===0||payload[0]===8)&&payload[1]===0xfe&&(!requireCrc||answered.size>0)){
        return {acknowledged:true,command:'DRIVER_ED',completion:'SAVE_END',crcCommands:[...answered],persistenceVerified:false};
      }
    }
    if(tolerant&&!requireCrc)return {acknowledged:true,command:'DRIVER_ED',completion:'SENT',confirmed:false,crcCommands:[...answered],persistenceVerified:false,frames,warning:'Save command sent; SAVE_END was not confirmed.'};
    throw Error(`Keyboard did not confirm SAVE_END; settings may be lost after disconnecting USB (frames ${frames}, CRC ${[...answered].map(command=>'0x'+command.toString(16)).join(',')||'none'})`);
  }finally{
    if(ownsStream)stream.close();
  }
}

module.exports={cacheCrc,saveDeviceMemory};
