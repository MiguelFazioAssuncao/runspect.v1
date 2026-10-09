// Parse muxer output and decode every sample with the browser's real WebCodecs.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.RECORDING_OUTPUT||'/tmp/runspect-recording';
function parse(data){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);const u32=p=>view.getUint32(p);const tag=p=>data.subarray(p,p+4).toString();
 function boxes(start,end){const result=[];for(let p=start;p<end;){const size=u32(p);assert.ok(size>=8 && p+size<=end);result.push({type:tag(p+4),start:p,end:p+size});p+=size;}return result;}
 const child=(parent,type)=>{const box=boxes(parent.start+8,parent.end).find(box=>box.type===type);assert.ok(box,`Missing ${type}`);return box;};
 const top=boxes(0,data.length),moov=top.find(box=>box.type==='moov');assert.ok(top.some(box=>box.type==='ftyp'));assert.ok(top.some(box=>box.type==='mdat'));assert.ok(moov);
 const trak=child(moov,'trak'),mdia=child(trak,'mdia'),mdhd=child(mdia,'mdhd'),stbl=child(child(mdia,'minf'),'stbl');
 const base=mdhd.start+(data[mdhd.start+8]===1?28:20);const timescale=u32(base);const duration=u32(base+4)/timescale;
 const stsd=child(stbl,'stsd'),entry={start:stsd.start+16,end:stsd.start+16+u32(stsd.start+16)};const codec=tag(entry.start+4);const configBox=boxes(entry.start+86,entry.end).find(box=>['avcC','vpcC','av1C'].includes(box.type));
 const description=configBox?data.subarray(configBox.start+8,configBox.end):null;
 const decoderConfig={codec:codec==='avc1'?`avc1.${[...description.subarray(1,4)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}`:codec==='vp09'?'vp09.00.40.08':'av01.0.08M.08',...(codec==='avc1'?{description:[...description]}:{})};
 const stsz=child(stbl,'stsz'),size=u32(stsz.start+12),count=u32(stsz.start+16);const sizes=Array.from({length:count},(_,i)=>size||u32(stsz.start+20+i*4));
 const stts=child(stbl,'stts'),durations=[];for(let p=stts.start+16;p<stts.end;p+=8){for(let i=0;i<u32(p);i++)durations.push(u32(p+4));}assert.equal(durations.length,count);assert.ok(Math.abs(durations.reduce((a,b)=>a+b,0)/timescale-duration)<.001);
 const stco=child(stbl,'stco'),offsets=Array.from({length:u32(stco.start+12)},(_,i)=>u32(stco.start+16+i*4));const stsc=child(stbl,'stsc');const groups=[];for(let p=stsc.start+16;p<stsc.end;p+=12)groups.push({first:u32(p),samples:u32(p+4)});
 const stss=child(stbl,'stss'),keys=new Set(Array.from({length:u32(stss.start+12)},(_,i)=>u32(stss.start+16+i*4)));
 const samples=[];let sampleIndex=0,timestamp=0;
 for(let c=0;c<offsets.length;c++){const group=groups.findLast(group=>group.first<=c+1);let offset=offsets[c];for(let j=0;j<group.samples;j++){const length=sizes[sampleIndex];assert.ok(offset+length<=data.length);const duration=durations[sampleIndex]/timescale*1e6;samples.push({data:[...data.subarray(offset,offset+length)],type:keys.has(sampleIndex+1)?'key':'delta',timestamp:Math.round(timestamp),duration:Math.round(duration)});offset+=length;sampleIndex++;timestamp+=duration;}}
 assert.equal(sampleIndex,count);return {decoderConfig,samples,codec,duration,count};
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage();await page.goto(process.env.RUNSPECT_URL||'http://localhost:3000');
const results=[];
for(const file of (await readdir(output)).filter(file=>file.endsWith('.mp4')&&file.startsWith(process.argv[2]||'validated-'))){
 const info=parse(await readFile(`${output}/${file}`));
 const decoded=await page.evaluate(async ({decoderConfig,samples})=>{
  if(decoderConfig.description)decoderConfig.description=new Uint8Array(decoderConfig.description);
  let decoded=0,error;const decoder=new VideoDecoder({output:frame=>{decoded++;frame.close();},error:e=>{error=e;}});
  try {decoder.configure(decoderConfig);for(const sample of samples){if(error)throw error;decoder.decode(new EncodedVideoChunk({...sample,data:new Uint8Array(sample.data)}));if(decoder.decodeQueueSize>8)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{decoder.removeEventListener('dequeue',drained);reject(new Error('decode queue timeout'));},5000);const drained=()=>{if(decoder.decodeQueueSize<8){clearTimeout(timer);decoder.removeEventListener('dequeue',drained);resolve();}};decoder.addEventListener('dequeue',drained);drained();});}await decoder.flush();if(error)throw error;return decoded;}finally{if(decoder.state!=='closed')decoder.close();}
 },info);assert.equal(decoded,info.count);const result={file,codec:info.codec,duration:info.duration,samples:info.count,decoded};results.push(result);console.log(JSON.stringify(result));
}
await writeFile(`${output}/decoded-${process.argv[2]||'validated'}.json`,JSON.stringify(results,null,2));await browser.close();
