// Row/response shapes from Lab3/backend/supabase/migrations (feature/backend @ 5a146f5).
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
  /** Who sees your posts and drops (social_community migration). Missing on a backend without it. */
  visibility?: 'public' | 'followers';
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

/** One per verified recycling activity, or one per claimed quest. Exactly one of the two source IDs is set. */
export type RewardTransaction = {
  id: number;
  user_id: string;
  recycling_action_id: number | null;
  quest_progress_id: number | null;
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

// ---------------------------------------------------------------------------------------------
// Community milestones (milestone_system migration)
// ---------------------------------------------------------------------------------------------

export type MilestoneStatus = 'Active' | 'AwaitingVerification' | 'Verified' | 'Rejected';

/** Returned by list_milestones: the public fields only, no evidence or admin decision. */
export type Milestone = {
  id: number;
  name: string;
  description: string | null;
  organisation: string;
  target_points: number;
  current_points: number;
  expected_outcome: string | null;
  closing_date: string | null;
  status: MilestoneStatus;
};

/** Returned by contribute_to_milestone. `accepted_amount` is less than asked when the milestone needed less. */
export type ContributionResult = {
  accepted_amount: number;
  available_eco_points: number;
  current_points: number;
  status: MilestoneStatus;
};

/** Returned by list_my_milestone_contributions: every contribution the caller has made, newest first. */
export type MilestoneContribution = {
  id: number;
  milestone_id: number;
  milestone_name: string;
  amount: number;
  created_at: string;
};

// ---------------------------------------------------------------------------------------------
// Leaderboard and community feed (leaderboard_api, community_feed migrations)
// ---------------------------------------------------------------------------------------------

export type LeaderboardPeriod = 'week' | 'all_time';

/**
 * Returned by get_leaderboard (lifetime Eco Points) and get_weekly_leaderboard (Eco Points from recycling verified this
 * week). Equal totals share a rank; people with 0 points are left out.
 */
export type LeaderboardEntry = {
  rank: number;
  username: string;
  display_name: string | null;
  level: number;
  eco_points: number;
};

/**
 * Returned by get_community_feed: verified recycling only, newest first. `username` is always "Anonymous Recycler";
 * `display_name` is the recycler's, or "Anonymous Recycler" when they haven't set one.
 */
export type CommunityFeedItem = {
  activity_id: number;
  username: string;
  display_name: string | null;
  material: string;
  quantity: number;
  recycled_at: string;
};

// ---------------------------------------------------------------------------------------------
// Quests and badges (quests_system, quest_progress_tracking, quest_reward_claims, badges_achievements)
// ---------------------------------------------------------------------------------------------

export type QuestType = 'daily' | 'weekly' | 'one_time';

export type Quest = {
  id: number;
  title: string;
  description: string | null;
  quest_type: QuestType;
  /** Verified recycling activities needed, not items. */
  target_actions: number;
  reward_eco_points: number;
  reward_xp: number;
  is_active: boolean;
  created_at: string;
};

/** One row per user, quest and period. Created by the server when an activity is verified. */
export type QuestProgress = {
  id: number;
  user_id: string;
  quest_id: number;
  /** 'YYYY-MM-DD': the Singapore day (daily), the Singapore Monday (weekly) or 1970-01-01 (one-time). */
  period_start: string;
  progress: number;
  completed_at: string | null;
  claimed_at: string | null;
};

/** Returned by claim_quest_reward. */
export type QuestClaimResult = {
  eco_points_awarded: number;
  xp_awarded: number;
  new_balance: number;
  new_level: number;
};

export type Badge = {
  id: number;
  name: string;
  description: string | null;
  /** Verified recycling activities needed, not items. */
  required_verified_actions: number;
  created_at: string;
};

export type UserBadge = {
  user_id: string;
  badge_id: number;
  earned_at: string;
};

/** What a badge counts (progress_rules migration). `streak` is the longest run achieved, not the current one. */
export type BadgeCriterion = 'verified_actions' | 'streak' | 'regions';

/** Returned by list_my_badge_progress: every badge, with the caller's progress towards it. */
export type BadgeProgress = {
  id: number;
  name: string;
  description: string | null;
  criterion: BadgeCriterion;
  target: number;
  progress: number;
  /** Null while locked. */
  earned_at: string | null;
};

/**
 * Returned by get_my_level_progress (reward_display_contracts migration). Levels are `xp_step` XP apart, and an admin can
 * change the step; a level already reached is kept, so `xp` can sit below the current level's start.
 */
export type LevelProgress = {
  level: number;
  xp: number;
  xp_step: number;
  /** XP at which the next level starts. */
  next_level_xp: number;
  /** Never negative. */
  remaining_xp: number;
};

/** Returned by estimate_recycling_reward: what a drop earns under the current rates and any seasonal bonus. */
export type RewardEstimate = { eco_points: number; xp: number };

// ---------------------------------------------------------------------------------------------
// Posts, comments, likes and follows (social_community, social_demo_contracts migrations; Lab3/backend/SOCIAL_API.md)
// ---------------------------------------------------------------------------------------------

export type FeedKind = 'discover' | 'following';
export type PostVisibility = 'public' | 'followers';

/** Returned by list_posts. Counts leave out people the viewer has blocked, or who blocked them. */
export type Post = {
  id: number;
  author_id: string;
  /** Defaults to "user_" plus the account ID, so screens show display_name (see personName). */
  username: string;
  display_name: string | null;
  caption: string;
  /** Lowercase, without the "#". */
  tags: string[];
  /** One to eight paths in the private `post-photos` bucket, in the order chosen. */
  photo_paths: string[];
  recycling_point_id: number | null;
  visibility: PostVisibility;
  created_at: string;
  like_count: number;
  comment_count: number;
  /** Whether the viewer has liked it. Always false for a guest. */
  liked: boolean;
  /** Set when shared from a verified check-in; check_in_points is the Eco Points it earned. */
  check_in_id: number | null;
  check_in_points: number | null;
  edited_at: string | null;
};

/** Returned by list_post_comments, newest first. */
export type PostComment = {
  id: number;
  author_id: string;
  username: string;
  display_name: string | null;
  body: string;
  created_at: string;
};

/** 'accepted' follows, 'pending' waits for a followers-only account to approve. */
export type FollowState = 'accepted' | 'pending' | 'none';

/** Returned by get_social_profile. Bio, avatar and counts are null on a followers-only account until a follow is approved. */
export type SocialProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
  visibility: PostVisibility;
  follow_state: FollowState;
  bio: string | null;
  avatar_url: string | null;
  follower_count: number | null;
  following_count: number | null;
};

export type ReportTarget = 'post' | 'comment';

/** Returned by find_social_profiles (prefix search on username or display name) and list_follow_requests. */
export type PersonSummary = {
  user_id: string;
  username: string;
  display_name: string | null;
  /** Not returned by list_follow_requests. */
  visibility?: PostVisibility;
};

export type NotificationKind =
  | 'like'
  | 'comment'
  | 'follow'
  | 'level_up'
  | 'badge_earned'
  | 'quest_completed'
  | 'milestone_verified'
  | 'streak_at_risk';

/** Returned by list_my_notifications, newest first. The payload's IDs depend on the kind (PROGRESS_API.md). */
export type AppNotification = {
  id: number;
  category: 'social' | 'progress' | 'streak_reminder';
  kind: NotificationKind;
  payload: {
    actor_id?: string;
    post_id?: number;
    comment_id?: number;
    level?: number;
    badge_id?: number;
    quest_id?: number;
    period_start?: string;
    milestone_id?: number;
    local_date?: string;
  };
  created_at: string;
  read_at: string | null;
};

/** get_my_notification_preferences / set_notification_preferences. */
export type NotificationPreferences = { social: boolean; progress: boolean; streak_reminder: boolean };

/** Returned by get_following_leaderboard: you and the people you follow, with points above zero. */
export type FollowingLeaderboardEntry = LeaderboardEntry & { user_id: string };
