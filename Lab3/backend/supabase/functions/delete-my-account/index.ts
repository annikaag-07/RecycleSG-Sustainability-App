import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { deleteAccount } from "./workflow.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return new Response(null, { status: 405, headers });
  const authorization = request.headers.get("Authorization");
  if (!authorization) return Response.json({ error: "Authentication required" }, { status: 401, headers });
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = { persistSession: false, autoRefreshToken: false };
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth,
    global: { headers: { Authorization: authorization } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth });
  try {
    await deleteAccount(caller, admin);
    return Response.json({ deleted: true }, { headers });
  } catch (error) {
    const status = error instanceof Error && "status" in error && error.status === 401 ? 401 : 503;
    return Response.json({
      error: status === 401 ? "Authentication required" : "Account removal incomplete. Retry to finish.",
    }, { status, headers });
  }
});
