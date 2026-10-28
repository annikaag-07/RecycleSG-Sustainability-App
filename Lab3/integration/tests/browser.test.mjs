import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './mock-server.mjs';

const root = fileURLToPath(new URL('artifacts/',import.meta.url));
const base = 'http://127.0.0.1:54321';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('actual browser screens + real verification adapter + migrated SQL (fake external services)', {timeout:300000}, async t=>{
  await mkdir(root,{recursive:true});
  const service=await startServer(root+'web');
  const cv=spawn('uv',['run','--no-project','--with-requirements','requirements-test.txt','python',fileURLToPath(new URL('mock-cv.py',import.meta.url))],{
    cwd:fileURLToPath(new URL('../../CV/',import.meta.url)),
    env:{...process.env,SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'test-service',FRONTEND_ORIGINS:base},
    stdio:['ignore','pipe','pipe'],
  });
  let cvLog=''; cv.stdout.on('data',d=>cvLog+=d); cv.stderr.on('data',d=>cvLog+=d);
  let browser;
  try {
    for(let n=0;n<100;n++) {
      if(await fetch('http://127.0.0.1:8001/health').then(r=>r.ok).catch(()=>false)) break;
      if(n===99) throw new Error('CV test service failed: '+cvLog);
      await sleep(100);
    }
    browser=await chromium.launch({channel:'chrome',headless:true});
    async function scenario(name, fn) {
      await t.test(name,{timeout:45000},async()=>{
        await service.reset();
        const context=await browser.newContext({viewport:{width:430,height:900},geolocation:{latitude:1.35,longitude:103.68,accuracy:5},permissions:['geolocation']});
        // Never call real maps, analytics or external services from this suite.
        await context.route('**/*', route=>{
          const url=new URL(route.request().url());
          if(['127.0.0.1','localhost'].includes(url.hostname)) return route.continue();
          return route.abort();
        });
        const page=await context.newPage();
        page.setDefaultTimeout(10000);
        const errors=[]; page.on('pageerror',e=>errors.push(e.message));
        try { await fn(page,service.state); assert.deepEqual(errors,[],'uncaught browser errors'); }
        catch(e) {
          await page.screenshot({path:root+name+'.png',fullPage:true});
          await writeFile(root+name+'.txt',await page.locator('body').innerText());
          throw e;
        } finally {await context.close();}
      });
    }
    async function login(page) {
      await page.goto(base+'/login');
      await page.getByRole('textbox',{name:'Email',exact:true}).fill('demo@example.com');
      await page.getByLabel('Password',{exact:true}).fill('DemoPassword123');
      await page.getByRole('button',{name:'Log in',exact:true}).click();
      await page.waitForURL('**/find');
    }
    async function prepareDrop(page, selectManually = true) {
      await login(page);
      const search=page.getByRole('textbox',{name:'What are you recycling?',exact:true});
      await search.fill('plastic bottle');
      await search.press('Enter');
      await page.getByRole('button',{name:/^Demo Classroom Bin\./}).click();
      await page.getByRole('button',{name:/Check in/i}).click();
      await page.getByRole('button',{name:'Continue — log your recycling'}).click();
      const chooser=page.waitForEvent('filechooser');
      await page.getByRole('button',{name:'Add a photo',exact:true}).click();
      await (await chooser).setFiles({name:'plastic.png',mimeType:'image/png',buffer:image});
      if (selectManually) await page.getByRole('button',{name:'Plastic',exact:true}).click();
    }
    async function logDrop(page) {
      await prepareDrop(page);
      await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).click();
      await page.waitForURL('**/find/reward/*');
    }
    await scenario('photo-auto-suggestion', async(page,state)=>{
      await prepareDrop(page, false);
      await page.getByText('Suggested Plastic. Confirm or change the selection below before logging.',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).isEnabled(),true);
      assert.equal((await state.db.query('SELECT * FROM recycling_actions')).rows.length,0);
      await page.screenshot({path:root+'photo-suggestion.png',fullPage:true});
      await page.getByRole('button',{name:'Glass',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Log 1 glass item · 10 points',exact:true}).isEnabled(),true);
    });
    await scenario('photo-uncertain-manual-fallback', async(page,state)=>{
      state.cvMode='unsure';
      await prepareDrop(page,false);
      await page.getByText(/Could not confidently identify this photo/).waitFor();
      assert.equal(await page.getByRole('button',{name:'Choose what you put in',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Plastic',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).isEnabled(),true);
      state.cvMode='ok';
      await page.getByRole('button',{name:'Retry photo recognition',exact:true}).click();
      await page.getByText(/Suggested Plastic. Your manual selection is unchanged/).waitFor();
    });
    await scenario('photo-service-failure', async(page)=>{
      await page.route('**/classify',r=>r.fulfill({status:503,body:'Unavailable'}));
      await prepareDrop(page,false);
      await page.getByText('Photo recognition is unavailable. Choose the material manually, or retry.',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Plastic',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).isEnabled(),true);
    });
    await scenario('photo-unaccepted-material', async(page)=>{
      await page.route('**/classify',r=>r.fulfill({json:{status:'ok',material:'batteries',confidence:0.95}}));
      await prepareDrop(page,false);
      await page.getByText(/Detected batteries, which this point does not list as accepted/).waitFor();
      assert.equal(await page.getByRole('button',{name:'Choose what you put in',exact:true}).isDisabled(),true);
    });
    await scenario('photo-late-result-preserves-manual-selection', async(page)=>{
      let release;
      const pending=new Promise(resolve=>{release=resolve;});
      await page.route('**/classify',async r=>{await pending;await r.fulfill({json:{status:'ok',material:'plastic',confidence:0.95}});});
      await prepareDrop(page,false);
      await page.getByText('Analysing photo…',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Glass',exact:true}).click();
      release();
      await page.getByText(/Suggested Plastic. Your manual selection is unchanged/).waitFor();
      assert.equal(await page.getByRole('button',{name:'Log 1 glass item · 10 points',exact:true}).isEnabled(),true);
    });
    await scenario('photo-retake-discards-old-response', async(page)=>{
      let release, requests=0;
      let markOldHandled;
      const oldHandled=new Promise(resolve=>{markOldHandled=resolve;});
      const pending=new Promise(resolve=>{release=resolve;});
      await page.route('**/classify',async r=>{
        if(++requests===1){await pending;await r.fulfill({json:{status:'ok',material:'plastic',confidence:0.95}}).catch(()=>{});markOldHandled();}
        else await r.fulfill({json:{status:'ok',material:'glass',confidence:0.95}});
      });
      await prepareDrop(page,false);
      await page.getByText('Analysing photo…',{exact:true}).waitFor();
      const chooser=page.waitForEvent('filechooser');
      await page.getByRole('button',{name:'Choose another',exact:true}).click();
      await (await chooser).setFiles({name:'glass.png',mimeType:'image/png',buffer:image});
      await page.getByText(/Suggested Glass. Confirm or change the selection below/).waitFor();
      release();
      await oldHandled;
      assert.equal(await page.getByRole('button',{name:'Log 1 glass item · 10 points',exact:true}).isEnabled(),true);
      assert.equal(await page.getByText(/Suggested Plastic/).count(),0);
    });
    await scenario('happy-journey', async(page,state)=>{
      const started=Date.now();
      await logDrop(page);
      await page.getByText('+10 Eco Points',{exact:true}).waitFor();
      await page.screenshot({path:root+'reward.png',fullPage:true});
      await page.getByRole('tab',{name:'Quests',exact:true}).click();
      await page.getByRole('button',{name:'One-off',exact:true}).click();
      await page.getByRole('button',{name:/^Claim 10 Eco Points/}).click();
      await page.getByText(/You now have 20 available/).waitFor();
      await page.getByRole('tab',{name:'You',exact:true}).click();
      await page.getByLabel('Badges: 1, earned',{exact:true}).waitFor();
      await page.getByRole('button',{name:'See impact and milestones'}).click();
      await page.getByText('0.10 kg CO₂',{exact:true}).waitFor();
      await page.getByRole('button',{name:/Clean & Green Singapore/}).click();
      await page.getByRole('button',{name:'10',exact:true}).click();
      await page.getByRole('button',{name:/Review/}).click();
      await page.getByRole('button',{name:'Confirm contribution',exact:true}).click();
      await page.getByText('You contributed 10 Eco Points',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Done',exact:true}).click();
      await page.screenshot({path:root+'impact.png',fullPage:true});
      await page.getByRole('tab',{name:'Feed',exact:true}).click();
      await page.getByText(/recycled 1 plastic item/).waitFor();
      await page.getByRole('tab',{name:'Ranks',exact:true}).click();
      await page.getByLabel(/^Rank 1, Demo Recycler/).waitFor();
      await state.db.exec('RESET ROLE');
      assert.deepEqual((await state.db.query('SELECT eco_points,available_eco_points,xp FROM profiles')).rows[0],{eco_points:20,available_eco_points:10,xp:20});
      assert.equal((await state.db.query('SELECT * FROM recycling_actions')).rows.length,1);
      t.diagnostic(`Happy journey elapsed ${((Date.now()-started)/1000).toFixed(1)}s (automated, not a human rehearsal)`);
    });
    await scenario('uncertain-then-retry',async(page,state)=>{
      state.cvMode='unsure';
      await logDrop(page);
      await page.getByText(/Recognition is uncertain or unavailable/).waitFor();
      assert.equal((await state.db.query('SELECT eco_points FROM profiles')).rows[0].eco_points,0);
      state.cvMode='ok';
      await page.getByRole('button',{name:'Retry verification',exact:true}).click();
      await page.getByText('+10 Eco Points',{exact:true}).waitFor();
      assert.equal((await state.db.query('SELECT * FROM recycling_actions')).rows.length,1);
    });
    await scenario('mismatch-no-award',async(page,state)=>{
      state.cvMode='mismatch'; await logDrop(page);
      await page.getByText('Couldn’t be verified',{exact:true}).waitFor();
      assert.equal((await state.db.query('SELECT eco_points FROM profiles')).rows[0].eco_points,0);
    });
    await scenario('unavailable-then-retry',async(page,state)=>{
      state.cvMode='unavailable'; await logDrop(page);
      await page.getByText(/Recognition is uncertain or unavailable/).waitFor();
      state.cvMode='ok';
      await page.getByRole('button',{name:'Retry verification',exact:true}).click();
      await page.getByText('+10 Eco Points',{exact:true}).waitFor();
    });
    await scenario('verification-service-error',async(page,state)=>{
      await page.route('http://127.0.0.1:8001/verify',route=>route.fulfill({status:503,contentType:'application/json',
        headers:{'Access-Control-Allow-Origin':base},body:JSON.stringify({detail:'Injected verification outage'})}),{times:1});
      await logDrop(page);
      await page.getByText('Injected verification outage',{exact:true}).waitFor();
      assert.equal((await state.db.query('SELECT eco_points FROM profiles')).rows[0].eco_points,0);
      await page.getByRole('button',{name:'Retry verification',exact:true}).click();
      await page.getByText('+10 Eco Points',{exact:true}).waitFor();
    });
    await scenario('upload-failure-retake',async(page,state)=>{
      state.failures['/storage/v1/object/']=1;
      await prepareDrop(page);
      await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).click();
      await page.getByText(/The photo didn't upload/).waitFor();
      assert.equal((await state.db.query('SELECT * FROM recycling_actions')).rows.length,0);
      const chooser=page.waitForEvent('filechooser');
      await page.getByRole('button',{name:'Choose another',exact:true}).click();
      await (await chooser).setFiles({name:'retaken.png',mimeType:'image/png',buffer:image});
      await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).click();
      await page.getByText('+10 Eco Points',{exact:true}).waitFor();
    });
    await scenario('lost-submit-response',async(page,state)=>{
      await page.route('**/rest/v1/rpc/submit_recycling_activity',async route=>{
        await route.fetch(); // Commit, then lose only the browser-facing response.
        await route.abort('failed');
      },{times:1});
      await prepareDrop(page);
      await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).click();
      await page.getByText(/Couldn't confirm the submission/).waitFor();
      await page.getByRole('button',{name:'Log 1 plastic item · 10 points',exact:true}).click();
      await page.getByText('+10 Eco Points',{exact:true}).waitFor();
      assert.equal((await state.db.query('SELECT * FROM recycling_actions')).rows.length,1);
      assert.equal((await state.db.query('SELECT * FROM reward_transactions')).rows.length,1);
    });
    await scenario('lost-contribution-response',async(page,state)=>{
      await logDrop(page); await page.getByText('+10 Eco Points',{exact:true}).waitFor();
      await page.goto(base+'/you/milestone/1');
      await page.getByRole('button',{name:'10',exact:true}).click();
      await page.getByRole('button',{name:/Review/}).click();
      await page.route('**/rest/v1/rpc/contribute_to_milestone',async route=>{
        await route.fetch();
        await route.abort('failed');
      },{times:1});
      await page.getByRole('button',{name:'Confirm contribution',exact:true}).click();
      await page.getByText(/Your contribution may have succeeded/).waitFor();
      await page.getByRole('button',{name:'Confirm contribution',exact:true}).click();
      await page.getByText('You contributed 10 Eco Points',{exact:true}).waitFor();
      assert.equal((await state.db.query('SELECT available_eco_points FROM profiles')).rows[0].available_eco_points,0);
    });
    await scenario('out-of-range',async(page,state)=>{
      await login(page);
      await page.context().setGeolocation({latitude:1.4,longitude:103.8,accuracy:5});
      await page.goto(base+'/find/check-in/1');
      await page.getByRole('button',{name:'Out of range',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Out of range',exact:true}).isDisabled(),true);
      assert.equal((await state.db.query('SELECT * FROM check_ins')).rows.length,0);
    });
    await scenario('imprecise-gps',async(page,state)=>{
      await login(page);
      await page.context().setGeolocation({latitude:1.35,longitude:103.68,accuracy:500});
      await page.goto(base+'/find/check-in/1');
      await page.getByText(/Your position is only accurate to about 500 m/).waitFor();
      assert.equal((await state.db.query('SELECT * FROM check_ins')).rows.length,0);
    });
    await scenario('cooldown-rehearsal',async(page,state)=>{
      await logDrop(page); await page.getByText('+10 Eco Points',{exact:true}).waitFor();
      await page.goto(base+'/find/check-in/1');
      const continueButton=page.getByRole('button',{name:/^Available from/});
      await continueButton.waitFor();
      assert.equal(await continueButton.isDisabled(),true);
      assert.equal((await state.db.query('SELECT * FROM check_ins')).rows.length,1);
    });
  } finally {
    await writeFile(root+'cv-service.log',cvLog);
    if(browser) await browser.close();
    cv.kill('SIGTERM');
    await service.close();
  }
});
