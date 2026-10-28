import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
const result = spawnSync(process.execPath, [frontend+'node_modules/expo/bin/cli', 'export', '--platform', 'web', '--output-dir', fileURLToPath(new URL('artifacts/web', import.meta.url))], {
  cwd: frontend, stdio: 'inherit', env: { ...process.env, CI:'1', EXPO_NO_TELEMETRY:'1',
    EXPO_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321', EXPO_PUBLIC_SUPABASE_ANON_KEY:'test-anon', EXPO_PUBLIC_VERIFICATION_URL:'http://127.0.0.1:8001' },
});
process.exit(result.status ?? 1);
