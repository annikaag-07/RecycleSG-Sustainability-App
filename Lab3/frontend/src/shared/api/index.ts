// Screens import from here: `import { api } from '@/shared/api'` then `api.points.searchNearby(...)`.
import * as auth from './auth';
import * as checkins from './checkins';
import * as classification from './classification';
import * as community from './community';
import * as milestones from './milestones';
import * as onemap from './onemap';
import * as photos from './photos';
import * as points from './points';
import * as profile from './profile';
import * as progress from './progress';
import * as proposed from './proposed';
import * as verification from './verification';

/** `api.proposed.*` targets endpoints the backend doesn't have yet — see API_ENDPOINTS.md. */
export const api = { auth, checkins, classification, community, milestones, onemap, photos, points, profile, progress, proposed, verification };

export { supabase } from './supabase';
export { ApiError, toApiError } from './errors';
export * from './types';
export type { ActivityImpact, VerificationResult } from './verification';
