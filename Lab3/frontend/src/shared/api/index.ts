// Screens import from here: `import { api } from '@/shared/api'` then `api.points.searchNearby(...)`.
import * as auth from './auth';
import * as checkins from './checkins';
import * as onemap from './onemap';
import * as points from './points';
import * as profile from './profile';

export const api = { auth, checkins, onemap, points, profile };

export { supabase } from './supabase';
export { ApiError, toApiError } from './errors';
export * from './types';
