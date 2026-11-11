import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";

export async function fixture() {
  const db = new PGlite();
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "33333333-3333-4333-8333-333333333333";
  await applyTestDatabase(db);
  await db.query("INSERT INTO auth.users(id,email_confirmed_at) VALUES ($1,now()),($2,now())", [a, b]);
  const asUser = async (uid) => {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await db.exec("SET ROLE authenticated");
  };
  return { db, a, b, asUser };
}

export async function applyTestDatabase(db, selectMigration) {
  await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz,banned_until timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
      GRANT SELECT,INSERT ON storage.objects TO authenticated;
    `);
  return applyMigrations(db, selectMigration);
}

export async function applyMigrations(db, selectMigration = () => true) {
  const root = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(root)).filter((f) => f.endsWith(".sql") && selectMigration(f)).sort();
  for (const file of files) {
    try {
      await db.exec(await readFile(new URL(file, root), "utf8"));
    } catch (cause) {
      throw new Error("Migration failed: " + file, { cause });
    }
  }
  return files.length;
}
