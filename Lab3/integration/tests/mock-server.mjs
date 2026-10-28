// TEST ONLY. Small Supabase HTTP adapter over the actual SQL migrations.
// Not an emulator of GoTrue/PostgREST/Storage and never used by the production app.
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const uid = '11111111-1111-4111-8111-111111111111';
export const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'demo@example.com',
  email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export const token = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:uid,exp:4102444800,aud:'authenticated',role:'authenticated'})}.test`;
const tables = new Set(['profiles','material_types','recycling_points','check_ins','recycling_actions','reward_transactions','quests','user_quest_progress','badges','user_badges']);

export async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
    GRANT SELECT,INSERT ON storage.objects TO authenticated;
  `);
  const root = new URL('../../backend/supabase/migrations/', import.meta.url);
  for (const f of (await readdir(root)).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(f,root),'utf8'));
  await db.exec(`INSERT INTO auth.users(id,email_confirmed_at) VALUES('${uid}',now());
    UPDATE profiles SET display_name='Demo Recycler' WHERE id='${uid}';
    INSERT INTO recycling_points(name,address,latitude,longitude,status) VALUES('Demo Classroom Bin','Demo address',1.35,103.68,'Available');
    INSERT INTO recycling_point_materials SELECT 1,id FROM material_types WHERE name IN ('Plastic','Paper','Glass','Metal');
    SELECT set_config('request.jwt.claim.sub','${uid}',false);`);
  return { db, uploads: new Map(), failures: {}, lostResponses: {}, calls: [], cvMode: 'ok' };
}

export async function startServer(webRoot) {
  let state = await fixture();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,HEAD,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    const json = (value, status=200) => { res.statusCode=status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); };
    if(req.method==='OPTIONS') return res.end();
    try {
      if(url.pathname==='/__test/cv') return json({mode:state.cvMode});
      if (!url.pathname.startsWith('/auth/') && !url.pathname.startsWith('/rest/') && !url.pathname.startsWith('/storage/')) {
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const target = path.resolve(webRoot, relative || 'index.html');
        if(!target.startsWith(path.resolve(webRoot)+path.sep)) return json({message:'not found'},404);
        let body;
        try { body=await readFile(target); } catch { body=await readFile(path.join(webRoot,'index.html')); }
        const ext = path.extname(target);
        res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf','.ico':'image/x-icon'})[ext] || 'text/html');
        return res.end(body);
      }
      state.calls.push({method:req.method,path:url.pathname});
      const failureKey=Object.keys(state.failures).find(key=>state.failures[key]>0 && url.pathname.startsWith(key));
      if(failureKey) { state.failures[failureKey]--; return json({message:'Injected test failure',code:'TEST_FAILURE'},503); }
      const bytes=[]; for await (const chunk of req) bytes.push(chunk);
      const raw=Buffer.concat(bytes);
      const body = req.headers['content-type']?.includes('application/json') && raw.length ? JSON.parse(raw) : {};
      if(url.pathname==='/auth/v1/token') return json({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
      if(url.pathname==='/auth/v1/user') return req.headers.authorization===`Bearer ${token}` ? json(user) : json({message:'invalid token'},401);
      if(url.pathname==='/auth/v1/logout') return json({});
      const privileged=req.headers.authorization==='Bearer test-service';
      await state.db.exec(privileged ? 'RESET ROLE' : 'SET ROLE authenticated');
      if(url.pathname.startsWith('/storage/v1/object/')) {
        const object=decodeURIComponent(url.pathname.replace('/storage/v1/object/','').replace(/^authenticated\//,''));
        if(req.method==='POST') {
          const name=object.replace('recycling-photos/','');
          if(state.uploads.has(object)) return json({message:'already exists'},409);
          await state.db.query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)', ['recycling-photos',name]);
          state.uploads.set(object,{bytes:raw,type:req.headers['content-type']});
          return json({Key:object});
        }
        const file=state.uploads.get(object);
        if(!file) return json({message:'not found'},404);
        res.setHeader('Content-Type',file.type); return res.end(file.bytes);
      }
      if(url.pathname.startsWith('/rest/v1/rpc/')) {
        const fn=url.pathname.split('/').at(-1);
        if(!/^[a-z_]+$/.test(fn)) throw new Error('invalid function');
        const entries=Object.entries(body);
        for(const [key] of entries) if(!/^[a-z_]+$/.test(key)) throw new Error('invalid argument');
        const result=await state.db.query(`SELECT * FROM ${fn}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(',')})`, entries.map(([,v])=>v));
        if(state.lostResponses[fn]) { state.lostResponses[fn]--; return req.socket.destroy(); }
        const scalar=['create_gps_checkin','submit_recycling_activity'].includes(fn);
        return json(scalar ? result.rows[0][fn] : result.rows);
      }
      const table=url.pathname.split('/').at(-1);
      if(!tables.has(table)) return json({message:`Unmocked endpoint: ${url.pathname}`},501);
      let result=(await state.db.query(`SELECT * FROM ${table}`)).rows.map(row => Object.fromEntries(
        Object.entries(row).map(([key,value]) => [key, value instanceof Date
          ? (key === 'period_start' ? value.toISOString().slice(0,10) : value.toISOString()) : value])));
      for(const [key,value] of url.searchParams) {
        if(value.startsWith('eq.')) result=result.filter(r=>String(r[key])===value.slice(3));
        if(value.startsWith('in.(')) { const wanted=value.slice(4,-1).split(',').map(v=>v.replaceAll('"','')); result=result.filter(r=>wanted.includes(String(r[key]).slice(0,10))); }
      }
      if(table==='recycling_points') {
        const links=(await state.db.query('SELECT recycling_point_id, mt.* FROM recycling_point_materials JOIN material_types mt ON mt.id=material_type_id')).rows;
        result=result.map(r=>({...r,recycling_point_materials:links.filter(l=>l.recycling_point_id===r.id).map(l=>({material_types:l}))}));
      }
      const count=result.length;
      if(url.searchParams.has('order')) {
        const [key,direction]=url.searchParams.get('order').split('.');
        result.sort((a,b)=>(a[key]<b[key]?-1:a[key]>b[key]?1:0)*(direction==='desc'?-1:1));
      }
      if(url.searchParams.has('limit')) result=result.slice(0,Number(url.searchParams.get('limit')));
      res.setHeader('Content-Range',`0-${Math.max(0,result.length-1)}/${count}`);
      if(req.method==='HEAD') return res.end();
      if(req.headers.accept?.includes('vnd.pgrst.object')) return result.length===1 ? json(result[0]) : json({message:'No single row',code:'PGRST116',details:'0 rows'},406);
      return json(result);
    } catch(e) { json({message:e.message,code:e.code || 'MOCK_ERROR'},400); }
  });
  await new Promise(resolve=>server.listen(54321,'127.0.0.1',resolve));
  return { get state(){return state;}, async reset(){await state.db.close();state=await fixture();}, async close(){await new Promise(resolve=>server.close(resolve));await state.db.close();} };
}
