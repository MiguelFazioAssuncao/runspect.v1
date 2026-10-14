import { confirmAllVisualizations, mockVisualizationAnalysis } from './browser-selection.mjs';
// Same PLAYWRIGHT_MODULE/CHROMIUM/RUNSPECT_URL options as recording-browser.mjs.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',args:['--no-sandbox'],headless:true});
const page = await browser.newPage({viewport:{width:1440,height:960}});
page.setDefaultTimeout(30000);
await page.addInitScript(() => {
  window.recTest={fault:'',encoders:0,frames:0,created:0,outputs:0};
  const Encoder=VideoEncoder;
  window.VideoEncoder=class extends Encoder {
    constructor(init) {
      super({...init,output:(chunk,meta)=>{window.recTest.outputs++;init.output(chunk,meta);}});
      this.ordinal=++window.recTest.created;window.recTest.encoders++;
    }
    encode(frame,options) {if(window.recTest.fault==='encode' && this.ordinal===2)throw new Error('injected encode failure');return super.encode(frame,options);}
    flush(){if(window.recTest.fault==='flush' && this.ordinal===2)return new Promise(()=>{});return super.flush();}
    close(){if(this.state!=='closed')window.recTest.encoders--;return super.close();}
    static isConfigSupported(config){if(window.recTest.fault==='prepare')return new Promise(()=>{});return Encoder.isConfigSupported(config);}
  };
  const Frame=VideoFrame;
  window.VideoFrame=class extends Frame { constructor(...args){super(...args);window.recTest.frames++;this.released=false;} close(){if(!this.released){window.recTest.frames--;this.released=true;}super.close();} };
  const serialize=XMLSerializer.prototype.serializeToString;
  XMLSerializer.prototype.serializeToString=function(node){if(window.recTest.fault==='capture')throw new Error('injected capture failure');return serialize.call(this,node);};
});
let count=80;
await mockVisualizationAnalysis(page, () => [{step_event:'VECTOR_INIT'}]);
await page.route('**/api/run',route=>{
 const steps=[{step:0,step_event:'VECTOR_INIT',data:{name:'a',values:[4,3,2,1]}}];
 for(let i=0;i<count;i++)steps.push({step:steps.length,step_event:'VECTOR_COMPARE',data:{name:'a',a:i%3,b:i%3+1}},{step:steps.length+1,step_event:'VECTOR_STEP',data:{name:'a',line:i%4+1}});
 return route.fulfill({json:{success:true,time_ms:0,steps}});
});
await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
await page.goto(process.env.RUNSPECT_URL || 'http://localhost:3000');
await page.addStyleTag({content:'nextjs-portal {display:none!important}'});
async function run(){await page.getByRole('button',{name:'Executar Algoritmo'}).click(); await confirmAllVisualizations(page);await page.waitForFunction(n=>document.querySelector('.timeline-step')?.textContent.includes(`/ ${n}`),count);}
async function start(fault=''){await page.evaluate(fault=>{window.recTest.fault=fault;window.recTest.created=0;window.recTest.outputs=0;},fault);await page.getByRole('button',{name:'Gravar',exact:true}).click();}
async function settled(){await page.waitForFunction(()=>/recording-status-(done|error)/.test(document.querySelector('.recording-status')?.className||''));await page.waitForFunction(()=>!document.querySelector('.recording-stage'));assert.equal(await page.getByLabel('Posição na linha do tempo').isEnabled(),true);const resources=await page.evaluate(()=>window.recTest);assert.equal(resources.encoders,0);assert.equal(resources.frames,0);return page.locator('.recording-status').innerText();}
const results=[];
await run();
await start('prepare');await page.getByRole('button',{name:'Parar',exact:true}).click();assert.match(await settled(),/nenhum arquivo/);assert.equal(await page.locator('.recording-status a').count(),0);results.push('cancel during preparation: no empty download, controls restored, resources closed');
await start();await page.waitForFunction(()=>window.recTest.outputs>4);assert.equal(await page.getByLabel('Posição na linha do tempo').isEnabled(),false);await page.getByRole('button',{name:'Parar',exact:true}).click();assert.match(await settled(),/parcial/);
const partial=await page.evaluate(async()=>{const v=document.createElement('video');v.src=document.querySelector('.recording-status a').href;await new Promise((res,rej)=>{v.onloadeddata=res;v.onerror=rej});const duration=v.duration;v.currentTime=Math.max(.001,duration-.02);await new Promise(res=>v.onseeked=res);v.removeAttribute('src');v.load();return duration;});assert.ok(partial>0 && partial<81);results.push(`cancel during capture: playable partial MP4 ${partial}s`);
await start('capture');assert.match(await settled(),/injected capture failure/);assert.equal(await page.locator('.recording-status a').count(),0);results.push('capture error: no download, controls restored, resources closed');
await start('encode');assert.match(await settled(),/injected encode failure/);assert.equal(await page.locator('.recording-status a').count(),0);results.push('encoder error: no download, controls restored, resources closed');
count=8;await run();await start('flush');await page.waitForFunction(()=>document.querySelector('.recording-status')?.className.includes('finalizing'));assert.ok(Number(await page.locator('.recording-status progress').getAttribute('value'))<1);await page.getByRole('button',{name:'Parar',exact:true}).click();assert.match(await settled(),/cancelada/);assert.equal(await page.locator('.recording-status a').count(),0);results.push('cancel stalled flush: no stale download, controls restored, resources closed');
await start();assert.match(await settled(),/concluída/);assert.equal(await page.locator('.recording-status a').count(),1);results.push('new recording after all failures: successful');
// Destroy the page while a finalization is pending: no delayed export may escape.
await start('flush');await page.waitForFunction(()=>document.querySelector('.recording-status')?.className.includes('finalizing'));let lateDownloads=0;page.on('download',()=>lateDownloads++);await page.goto('about:blank');assert.equal(lateDownloads,0);results.push('page exit during finalization: no late download');
console.log(JSON.stringify(results,null,2));const output=process.env.RECORDING_OUTPUT||'/tmp/runspect-recording';await mkdir(output,{recursive:true});await writeFile(`${output}/lifecycle.json`,JSON.stringify(results,null,2));await browser.close();
