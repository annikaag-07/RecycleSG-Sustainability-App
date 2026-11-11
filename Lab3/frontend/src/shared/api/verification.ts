import { supabase } from './supabase';
import { ApiError } from './errors';

export type ActivityImpact = {
  estimated_co2_saved_kg: number;
  is_estimate: boolean;
  basis: string;
};

export type VerificationResult = {
  activity_id: number;
  status: 'Pending' | 'Verified' | 'Rejected';
  material: string | null;
  confidence: number | null;
  message: string;
  activity_impact: ActivityImpact | null;
};

/** Only send the user's token and activity ID. Secrets and acceptance rules live on the service. */
export async function verifyActivity(activityId: number): Promise<VerificationResult> {
  const url = process.env.EXPO_PUBLIC_VERIFICATION_URL;
  if (!url) throw new ApiError('Verification service is not configured. Your recycling is saved as pending.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new ApiError('Log in again to verify recycling.');
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 25000);
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify({ activity_id: activityId }), signal: abort.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new ApiError(typeof result.detail === 'string' ? result.detail : 'Verification failed. You can retry safely.');
    return result as VerificationResult;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Could not confirm verification. Your recycling is saved; retry safely.', 'network');
  } finally { clearTimeout(timeout); }
}
