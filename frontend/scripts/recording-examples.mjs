import { confirmAllVisualizations } from './browser-selection.mjs';
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox'],headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(60000);
await page.goto(process.env.RUNSPECT_URL||'http://localhost:3000');await page.addStyleTag({content:'nextjs-portal {display:none!important}'});
await page.getByRole('tab',{name:'técnicas'}).click();
const results=[];const output=process.env.RECORDING_OUTPUT||'/tmp/runspect-recording';await mkdir(output,{recursive:true});
for(const [id,speed,layout] of (process.env.EXAMPLE_CASES?JSON.parse(process.env.EXAMPLE_CASES):[['binary-search',.5,'force'],['bubble-sort',4,'force'],['bfs-shortest-path',8,'circular'],['bfs-shortest-path',16,'force']])){
 await page.getByLabel('Selecionar técnica de programação competitiva').selectOption(id);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/run'));
 await page.getByRole('button',{name:'Executar Algoritmo'}).click(); await confirmAllVisualizations(page);const execution=await (await response).json();assert.equal(execution.success,true); console.log("executed",id,execution.steps.length);
 await writeFile(`${output}/trace-${id}.json`,JSON.stringify(execution));
 await page.getByRole('button',{name:'Executar Algoritmo'}).waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('.timeline-step')?.textContent.match(/\/ [1-9]/));
 await page.getByLabel('Velocidade de reprodução').selectOption(String(speed));if(id.startsWith('bfs'))await page.getByLabel('Layout do grafo').selectOption(layout);
 const ends=execution.steps.map((step,index)=>['STEP','VECTOR_STEP'].includes(step.step_event)?index:-1).filter(index=>index>=0);if(ends.at(-1)!==execution.steps.length-1)ends.push(execution.steps.length-1);
 const lineFrame=ends.findIndex(index=>Number(execution.steps[index].data?.line)>0);
 if(lineFrame>=0){await page.getByLabel('Posição na linha do tempo').evaluate((input,index)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,index);input.dispatchEvent(new Event('input',{bubbles:true}));},lineFrame);await page.locator('.exec-line').first().waitFor({state:'attached'});}
 const timeline=await page.getByLabel('Posição na linha do tempo').inputValue();const decoration=await page.locator('.exec-line').count();
 await page.getByRole('button',{name:'Gravar',exact:true}).click();await page.waitForFunction(()=>/recording-status-(done|error)/.test(document.querySelector('.recording-status')?.className||''));
 const status=await page.locator('.recording-status').innerText();assert.match(status,/concluída/);
 assert.equal(await page.getByLabel('Posição na linha do tempo').inputValue(),timeline);assert.equal(await page.locator('.exec-line').count(),decoration);
 const downloadPromise=page.waitForEvent('download');await page.locator('.recording-status a').click();await (await downloadPromise).saveAs(`${output}/example-${id}-${speed}-${layout}.mp4`);
 const video=await page.evaluate(async()=>{const v=document.createElement('video');v.src=document.querySelector('.recording-status a').href;await new Promise((res,rej)=>{v.onloadeddata=res;v.onerror=rej});const info={duration:v.duration,width:v.videoWidth,height:v.videoHeight};v.currentTime=Math.max(0,v.duration-.02);await new Promise(res=>v.onseeked=res);v.removeAttribute('src');v.load();return info;});
 const steps=Number((await page.locator('.timeline-step').innerText()).split('/')[1]);assert.ok(Math.abs(video.duration-(steps/speed+1))<.001);
 const row={id,speed,layout,steps,events:execution.steps.length,status,video,codeHighlightVerified:decoration>0};results.push(row);console.log(JSON.stringify(row));await writeFile(`${output}/examples.json`,JSON.stringify(results,null,2));
}
await writeFile(`${output}/examples.json`,JSON.stringify(results,null,2));await browser.close();
