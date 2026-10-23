// Row/response shapes from Lab3/backend/supabase/migrations (feature/backend @ 19ad79f).
// Keep in sync with API_ENDPOINTS.md if the backend changes.

export type PointStatus =
  | 'Available'
  | 'Full'
  | 'Temporarily Closed'
  | 'Inaccessible'
  | 'Removed'
  | 'Information Outdated';

export type MaterialType = {
  id: number;
  name: string;
  description: string | null;
};

/** Returned by search_recycling_points_by_material. */
export type RecyclingPointSummary = {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  status: PointStatus;
};

/** Returned by search_nearby_recycling_points. */
export type NearbyRecyclingPoint = RecyclingPointSummary & {
  distance_km: number;
};

export type RecyclingPointDetail = RecyclingPointSummary & {
  operating_hours: string | null;
  source: string | null;
  last_updated: string;
  materials: MaterialType[];
};

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** Lifetime total — used for levels and leaderboards. */
  eco_points: number;
  /** Spendable balance for milestone contributions. */
  available_eco_points: number;
  xp: number;
  level: number;
  created_at: string;
};

export type EditableProfileFields = Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'bio'>>;

export type VerificationStatus = 'Pending' | 'Verified' | 'Rejected';

export type CheckIn = {
  id: number;
  user_id: string;
  recycling_point_id: number;
  latitude: number;
  longitude: number;
  distance_meters: number | null;
  checked_in_at: string;
};

export type RecyclingAction = {
  id: number;
  user_id: string;
  check_in_id: number;
  material_type_id: number;
  quantity: number;
  photo_url: string | null;
  cv_predicted_material: string | null;
  cv_confidence: number | null;
  verification_status: VerificationStatus;
  created_at: string;
  verified_at: string | null;
};

export type RewardTransaction = {
  id: number;
  user_id: string;
  recycling_action_id: number;
  eco_points_earned: number;
  xp_earned: number;
  created_at: string;
};

export type EnvironmentalImpact = {
  total_verified_actions: number;
  total_recycled_units: number;
  estimated_co2_saved_kg: number;
  tree_equivalents: number;
};

export type LatLng = { latitude: number; longitude: number };
