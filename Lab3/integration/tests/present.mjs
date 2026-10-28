// Laptop demo launcher. Real services; explicitly simulated browser GPS.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const cv=fileURLToPath(new URL('../../CV/',import.meta.url));
const frontend=fileURLToPath(new URL('../../frontend/',import.meta.url));
const artifacts=fileURLToPath(new URL('artifacts/live/',import.meta.url));
await mkdir(artifacts,{recursive:true});
const children=[];
async function running(url){return fetch(url,{signal:AbortSignal.timeout(1500)}).then(r=>r.ok).catch(()=>false);}
async function ensure(url,cmd,args,cwd) {
  if(await running(url)) return;
  const child=spawn(cmd,args,{cwd,stdio:'ignore'});children.push(child);
  child.on('error',()=>{});
  for(let i=0;i<60;i++) {
    if(await running(url)) return;
    if(child.exitCode!==null) break;
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error(`Could not start ${cmd}; see docs/demo/START_HERE.md`);
}
let browser;
try {
  // Start services before reading CV secrets into this launcher's process.
  await ensure('http://127.0.0.1:8000/health','uv',['run','--no-project','--with-requirements','requirements.txt','uvicorn','app:app','--host','127.0.0.1','--port','8000'],cv);
  await ensure('http://127.0.0.1:8081','npm',['start','--','--web','--port','8081'],frontend);
  process.loadEnvFile(cv+'.env');
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(url!=='https://zwyibrksagddbrqiqaqf.supabase.co') throw new Error('Unexpected demo project');
  async function api(path,body) {
    const r=await fetch(url+path,{method:body?'POST':'GET',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
    if(!r.ok) throw new Error(`Demo preparation HTTP ${r.status}`);
    return r.json();
  }
  let account=await readFile(artifacts+'demo-account.json','utf8').then(JSON.parse).catch(()=>null);
  if(account && !/^[0-9a-f-]{36}$/.test(account.id)) throw new Error('Invalid local demo account');
  const used=account ? (await api(`/rest/v1/check_ins?user_id=eq.${account.id}&select=id&limit=1`)).length : 1;
  if(used) {
    const email=`recyclesg-demo-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
    const created=await api('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{display_name:'Demo Recycler'}});
    const point=(await api('/rest/v1/rpc/search_recycling_points_by_material?limit=1',{p_material:'Plastic'}))[0];
    account={id:created.id,email,password,point};
    await writeFile(artifacts+'demo-account.json',JSON.stringify(account,null,2),{mode:0o600});
  }
  browser=await chromium.launch({channel:'chrome',headless:false});
  const context=await browser.newContext({viewport:{width:430,height:900},geolocation:{latitude:account.point.latitude,longitude:account.point.longitude,accuracy:5},permissions:['geolocation']});
  const page=await context.newPage();page.setDefaultTimeout(45000);
  await page.goto('http://127.0.0.1:8081/login');
  await page.getByRole('textbox',{name:'Email',exact:true}).fill(account.email);
  await page.getByLabel('Password',{exact:true}).fill(account.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await page.waitForURL('**/find');
  console.log('Ready: real Supabase + Gemini; SIMULATED GPS at '+account.point.address);
  console.log('Use docs/demo/assets/plastic-bottle.png. Follow docs/demo/START_HERE.md.');
  console.log('Close this Chrome window to end the session. Relaunch after a used check-in for a fresh account.');
  await new Promise(resolve=>browser.on('disconnected',resolve));
} finally {
  if(browser?.isConnected()) await browser.close();
  for(const child of children) child.kill('SIGTERM');
}
