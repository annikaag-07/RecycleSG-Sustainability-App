// Explicit live rehearsal: real Supabase + real Gemini; only GPS is simulated.
// Start Expo :8081 and FastAPI :8000 first. Accounts/results are retained as demo evidence.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

process.loadEnvFile(fileURLToPath(new URL('../../CV/.env', import.meta.url)));
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.equal(url,'https://zwyibrksagddbrqiqaqf.supabase.co');
const root=fileURLToPath(new URL('artifacts/live/',import.meta.url));
await mkdir(root,{recursive:true});
async function api(path,body,method=body?'POST':'GET') {
  const r=await fetch(url+path,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
  assert.ok(r.ok,`${method} ${path.split('?')[0]} HTTP ${r.status}`);
  return r.json();
}
async function account(label) {
  const email=`recyclesg-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
  const u=await api('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{display_name:label}});
  return {id:u.id,email,password};
}
const point=(await api('/rest/v1/rpc/search_recycling_points_by_material?limit=1',{p_material:'Plastic'}))[0];
const credentials=await account('Automated live rehearsal');
await writeFile(root+'rehearsal-account.json',JSON.stringify(credentials,null,2),{mode:0o600});
console.log('Created dedicated rehearsal account; credentials saved locally, not printed.');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:430,height:900},geolocation:{latitude:point.latitude,longitude:point.longitude,accuracy:5},permissions:['geolocation']});
const page=await context.newPage();
page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const started=Date.now();
try {
  await page.goto('http://127.0.0.1:8081/login');
  await page.getByRole('textbox',{name:'Email',exact:true}).fill(credentials.email);
  await page.getByLabel('Password',{exact:true}).fill(credentials.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await page.waitForURL('**/find');
  console.log('PASS real browser login');
  const search=page.getByRole('textbox',{name:'What are you recycling?',exact:true});
  await search.fill('plastic bottle');await search.press('Enter');
  const title=point.address.split(',')[0].trim();
  const escaped=title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  await page.getByRole('button',{name:new RegExp('^'+escaped+'\\.','i')}).first().click();
  await page.getByRole('button',{name:/Check in/i}).click();
  await page.getByRole('button',{name:'Continue — log your recycling'}).click();
  console.log('PASS real search and check-in (simulated GPS)');
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Add a photo',exact:true}).click();
  await (await chooser).setFiles(fileURLToPath(new URL('../../../docs/demo/assets/plastic-bottle.png',import.meta.url)));
  await page.getByRole('button',{name:'Plastic',exact:true}).click();
  await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).click();
  await page.getByText('+10 Eco Points',{exact:true}).waitFor();
  await page.screenshot({path:root+'reward.png',fullPage:true});
  console.log('PASS real upload, Gemini, Verified and +10 points');
  await page.getByRole('tab',{name:'Quests',exact:true}).click();
  await page.getByRole('button',{name:'One-off',exact:true}).click();
  await page.getByRole('button',{name:/^Claim 10 Eco Points/}).click();
  await page.getByText(/You now have 20 available/).waitFor();
  await page.getByRole('tab',{name:'You',exact:true}).click();
  await page.getByLabel('Badges: 1, earned',{exact:true}).waitFor();
  await page.getByRole('button',{name:'See impact and milestones'}).click();
  await page.getByText(/^0\.10? kg CO₂$/).waitFor();
  await page.getByRole('button',{name:/Clean & Green Singapore/}).click();
  await page.getByRole('button',{name:'10',exact:true}).click();
  await page.getByRole('button',{name:/Review/}).click();
  await page.getByRole('button',{name:'Confirm contribution',exact:true}).click();
  await page.getByText('You contributed 10 Eco Points',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByText('10',{exact:true}).waitFor();
  await page.getByRole('button',{name:/Clean & Green Singapore/}).waitFor();
  await page.screenshot({path:root+'impact.png',fullPage:true});
  const profile=(await api(`/rest/v1/profiles?id=eq.${credentials.id}&select=eco_points,available_eco_points,xp`))[0];
  assert.deepEqual(profile,{eco_points:20,available_eco_points:10,xp:20});
  const actions=await api(`/rest/v1/recycling_actions?user_id=eq.${credentials.id}&select=id,verification_status,cv_predicted_material,cv_confidence,verified_at`);
  assert.equal(actions.length,1);assert.equal(actions[0].verification_status,'Verified');assert.ok(actions[0].verified_at);
  console.log('PASS real quest, badge, impact and milestone contribution; balances 20/10/20');
  await page.getByRole('tab',{name:'Feed',exact:true}).click();
  await page.getByText(/recycled 1 plastic item/).first().waitFor();
  await page.getByText('Automated live rehearsal',{exact:true}).first().waitFor();
  const feed=await api('/rest/v1/rpc/get_community_feed',{p_limit:100});
  const ownFeed=feed.find(row=>row.activity_id===actions[0].id);
  assert.equal(ownFeed.display_name,'Automated live rehearsal');
  assert.equal(ownFeed.username,'Anonymous Recycler');
  await page.getByRole('tab',{name:'Ranks',exact:true}).click();
  await page.getByLabel(/Automated live rehearsal/).first().waitFor();
  assert.deepEqual(errors,[]);
  const report={testedAt:new Date().toISOString(),gps:'simulated',services:'real Supabase + Gemini',elapsedSeconds:(Date.now()-started)/1000,point,profile,actions};
  await writeFile(root+'result.json',JSON.stringify(report,null,2));
  const ready=await account('Demo Recycler');
  await writeFile(root+'demo-account.json',JSON.stringify({...ready,point},null,2),{mode:0o600});
  console.log('PASS feed and ranks. Fresh zero-point presentation account prepared.');
} catch(e) {
  await page.screenshot({path:root+'failure.png',fullPage:true});
  await writeFile(root+'failure.txt',await page.locator('body').innerText());
  throw e;
} finally {await browser.close();}
