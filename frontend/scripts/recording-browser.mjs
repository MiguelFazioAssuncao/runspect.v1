// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/recording-browser.mjs baseline
import { writeFile, mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const label = process.argv[2] || 'after';
const output = process.env.RECORDING_OUTPUT || '/tmp/runspect-recording';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true });
page.setDefaultTimeout(60000);
if (process.env.FORCE_CODEC) await page.addInitScript(codec => {
  const supported = VideoEncoder.isConfigSupported.bind(VideoEncoder);
  VideoEncoder.isConfigSupported = config => config.codec.startsWith(codec) ? supported(config) : Promise.resolve({supported:false,config});
}, process.env.FORCE_CODEC);
await page.addInitScript(() => {
  window.recSnapshots = [];
  const serialize = XMLSerializer.prototype.serializeToString;
  XMLSerializer.prototype.serializeToString = function(node) {
    const area = node.querySelector?.('[data-recording-step]');
    if (area) window.recSnapshots.push({step:Number(area.dataset.recordingStep),event:Number(area.dataset.recordingEvent),line:Number(area.dataset.recordingLine),positions:[...area.querySelectorAll('g[data-graph-content] > g > g')].map(node => node.getAttribute('transform')),states:[...area.querySelectorAll('.vector-cell')].map(node => node.className)});
    return serialize.call(this,node);
  };
});
let trace = [];
const event = (step_event, data) => trace.push({ step: trace.length, step_event, data });
function fixture(kind, count) {
  trace = [];
  if (kind === 'vector') event('VECTOR_INIT', { name: 'a', values: [8,7,6,5,4,3,2,1] });
  else {
    event('SET_DIRECTED', { directed: false });
    for (let i=0;i<12;i++) event('ADD_NODE', { id:i, label:String(i) });
    for (let i=0;i<11;i++) event('ADD_EDGE', { u:i,v:i+1 });
  }
  for (let i=0;i<count;i++) {
    if (kind === 'vector') event(i%2 ? 'VECTOR_SWAP' : 'VECTOR_COMPARE', {name:'a',a:i%7,b:i%7+1,caption:`Operação ${i}`,line:i%8+1});
    else {event('GRAPH_RESET', {}); event('GRAPH_NODE', {id:i%12,state:'visiting'});}
    event(kind === 'vector' ? 'VECTOR_STEP':'STEP', {name:'a',caption:`Passo ${i}`,line:i%8+1});
  }
}
await page.route('**/api/run', route => route.fulfill({ json: { success:true,steps:trace,time_ms:1 } }));
// Isolate recording from Monaco's CDN/network while keeping the real application DOM.
await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.log('pageerror',e.message); });
await page.goto(process.env.RUNSPECT_URL || 'http://localhost:3000');
console.log('page ready');
await page.addStyleTag({content: 'nextjs-portal {display:none!important} .recording-area {width:682px!important;height:606px!important;flex:none!important}'});
await page.getByRole('button',{name:'Executar Algoritmo'}).waitFor();
const results = [];
const failures = [];
const cases = process.env.RECORDING_CASES ? JSON.parse(process.env.RECORDING_CASES) : [['vector',8,1,'force'],['vector',80,1,'force'],['vector',8,4,'force'],['vector',8,.5,'force'],['graph',8,2,'circular'],['graph',80,1,'force'], ...(label.startsWith('baseline') ? [] : [['vector',80,8,'force'],['vector',80,128,'force'],['graph',80,4,'force']])];
for (const [kind,count,speed,layout] of cases) {
  console.log("starting",kind,count,speed);
  fixture(kind,count);
  await page.getByRole('button',{name:'Executar Algoritmo'}).click();
  await page.waitForFunction(count => document.querySelector('.timeline-step')?.textContent.includes(`/ ${count}`), count);
  await page.getByRole('button',{name:'Gravar',exact:true}).waitFor({state:'visible'});
  if (await page.getByLabel('Velocidade de reprodução').count()) await page.getByLabel('Velocidade de reprodução').selectOption(String(speed));
  else await page.getByRole('button',{name:`${speed}x`,exact:true}).click();
  if (kind === 'graph') await page.getByLabel('Layout do grafo').selectOption(layout);
  await page.evaluate(() => {performance.clearMeasures();window.recSnapshots=[];});

  await page.getByRole('button',{name:'Gravar',exact:true}).click();
  console.log('recording started');
  await page.waitForFunction(() => performance.getEntriesByName('recording:total').length > 0);
  try { await page.waitForFunction(() => /concluída|Falha/.test(document.querySelector('.recording-status')?.textContent || ''),null,{timeout:60000}); } catch(e) {console.log(await page.locator('body').innerText()); throw e;}
  let status = await page.locator('.recording-status').innerText();
  for (let attempt = 0; label.startsWith('baseline') && status.includes('Falha') && attempt < 5; attempt++) {
    failures.push({kind,count,speed,status}); console.log('retry after failure',status);
    await page.evaluate(() => {performance.clearMeasures();window.recSnapshots=[];});
    await page.getByRole('button',{name:'Gravar',exact:true}).click();
    await page.waitForFunction(() => performance.getEntriesByName('recording:total').length > 0);
    await page.waitForFunction(() => /concluída|Falha/.test(document.querySelector('.recording-status')?.textContent || ''));
    status = await page.locator('.recording-status').innerText();
  }
  if (status.includes('Falha')) { results.push({kind,count,speed,layout,status}); console.log(status); await writeFile(`${output}/${label}.json`, JSON.stringify({results,failures,errors},null,2)); continue; }
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.recording-status a').click();
  const download = await downloadPromise;
  await download.saveAs(`${output}/${label}-${kind}-${count}-${speed}-${layout}.mp4`);
  if (!label.startsWith('baseline')) {
    const snapshots = await page.evaluate(() => window.recSnapshots);
    if (snapshots.length !== count || snapshots.some((item, index) => item.step !== index || item.line !== index%8+1 || trace[item.event]?.data?.line !== item.line)) throw new Error('Frame/code synchronization failed');
    if (kind === 'graph' && snapshots.some(item => JSON.stringify(item.positions)!==JSON.stringify(snapshots[0].positions))) throw new Error('Static graph layout was recomputed on color-only steps');
  }
  const measurements = await page.evaluate(() => {
    const summary = {};
    for (const item of performance.getEntriesByType('measure')) if(item.name.startsWith('recording:')) summary[item.name] = (summary[item.name] || 0) + item.duration;
    return summary;
  });
  // Decode and seek actual MP4 in the browser. Seeking checks the final sample too.
  const video = await page.evaluate(async () => {
    const link = document.querySelector('.recording-status a');
    const v = document.createElement('video'); v.muted = true; v.src = link.href;
    await new Promise((resolve,reject) => {v.onloadeddata=resolve;v.onerror=()=>reject(new Error('invalid MP4'));});
    v.currentTime = .001; await new Promise(resolve => {v.onseeked=resolve;});
    const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight; const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0);
    const metadata = {duration:v.duration,width:v.videoWidth,height:v.videoHeight,first:canvas.toDataURL()};
    v.currentTime = Math.max(0,v.duration-.05);
    await new Promise((resolve,reject) => {v.onseeked=resolve;v.onerror=reject;});
    ctx.drawImage(v,0,0);metadata.last=canvas.toDataURL();canvas.width=0;canvas.height=0;
    v.removeAttribute('src');v.load();
    return metadata;
  });
  for(const frame of ['first','last']) {await writeFile(`${output}/${label}-${kind}-${count}-${speed}-${layout}-${frame}.png`,Buffer.from(video[frame].split(',')[1],'base64'));delete video[frame];}
  if (Math.abs(video.duration-(count/speed+1))>.001 && !label.startsWith('baseline')) throw new Error(`Incorrect duration: ${video.duration}`);
  const row={kind,count,speed,layout,status,measurements,video}; results.push(row); console.log(JSON.stringify(row)); await writeFile(`${output}/${label}.json`, JSON.stringify({results,failures,errors},null,2));
}
await writeFile(`${output}/${label}.json`, JSON.stringify({results,failures,errors},null,2));
await browser.close();
