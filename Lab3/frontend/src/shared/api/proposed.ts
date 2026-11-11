import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { ApiError, toApiError } from './errors';
import type { MilestoneStatus } from './types';

// PostgREST: PGRST202 = function not found, PGRST205 = table not found, 42883 = undefined function.
const MISSING = new Set(['PGRST202', 'PGRST205', '42883']);

export async function getMyRoles() {
  const [admin, moderator] = await Promise.all([
    supabase.rpc('is_app_admin'),
    supabase.rpc('is_content_moderator'),
  ]);
  const isAdmin = !admin.error && admin.data === true;
  return { isAdmin, isModerator: isAdmin || (!moderator.error && moderator.data === true) };
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (MISSING.has(String(error.code))) {
      throw new ApiError('This feature isn’t available on the server yet.', 'not_available');
    }
    throw toApiError(error);
  }
  return data as T;
}

/** Idempotency key so a retried request is processed once (NFR-QUAL-06, REQ-13.12 style). */
export function newRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------------------------
// Recycling-point reports (REQ-3.8, UC 2.3)
// ---------------------------------------------------------------------------------------------

export type ReportCategory = 'full' | 'missing_or_damaged' | 'wrong_info' | 'contaminated';

export type PointReport = {
  clientRequestId: string;
  recyclingPointId: number;
  pointTitle: string;
  category: ReportCategory;
  description: string | null;
  createdAt: string;
};

export async function submitPointReport(ownerId: string, r: PointReport): Promise<number> {
  return rpc<number>('submit_owned_point_report', {
    p_owner_id: ownerId,
    p_recycling_point_id: r.recyclingPointId,
    p_category: r.category,
    p_description: r.description,
    p_client_request_id: r.clientRequestId,
  });
}

// The owner of v1 entries cannot be established after an account switch.
const reportPrefix = (ownerId: string) => `recyclesg.reports.outbox.v2.${ownerId}.`;

export async function queueReport(ownerId: string, report: PointReport) {
  await AsyncStorage.setItem(reportPrefix(ownerId) + report.clientRequestId, JSON.stringify(report));
}

export async function flushReportOutbox(ownerId: string): Promise<number> {
  const prefix = reportPrefix(ownerId);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  let sent = 0;
  for (const key of keys) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    try {
      const report: PointReport = JSON.parse(raw);
      await submitPointReport(ownerId, report);
      await AsyncStorage.removeItem(key);
      sent++;
    } catch {
      // Keep this item for its owner's next session or reconnect.
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------------------------
// Account deletion (REQ-1.7, UC 6.1.AC.6) — personal media and identity cleanup run in the Edge Function.
// ---------------------------------------------------------------------------------------------

export async function deleteMyAccount() {
  const { error } = await supabase.functions.invoke('delete-my-account', { method: 'POST' });
  if (error) throw toApiError(error);
}

// ---------------------------------------------------------------------------------------------
// Administrator: environmental milestone verification (REQ-13.9–13.11, UC 7.1)
// ---------------------------------------------------------------------------------------------

// Now a real server type (milestone_system migration); re-exported so existing imports keep working.
export type { MilestoneStatus };

export type MilestoneForReview = {
  id: number;
  name: string;
  description: string;
  organisation: string;
  target_points: number;
  current_points: number;
  expected_outcome: string;
  closing_date: string | null;
  status: MilestoneStatus;
  evidence_url: string | null;
  evidence_notes: string | null;
  evidence_requested_note: string | null;
  decided_at: string | null;
  decision_reason: string | null;
};

export type MilestoneDecision = 'verify' | 'reject' | 'request_evidence';

/** Live on the backend (milestone_system migration): admin_list_milestones_for_review() → MilestoneForReview[]. Admins only (42501 otherwise). */
export function listMilestonesForReview() {
  return rpc<MilestoneForReview[]>('admin_list_milestones_for_review');
}

/**
 * RPC: admin_decide_milestone(p_milestone_id, p_decision, p_reason, p_expected_status).
 * p_expected_status lets the server refuse a second decision if another admin got there first (UC 7.1.EX.2).
 */
export function decideMilestone(milestoneId: number, decision: MilestoneDecision, reason: string | null) {
  return rpc<MilestoneStatus>('admin_decide_milestone', {
    p_milestone_id: milestoneId,
    p_decision: decision,
    p_reason: reason,
    p_expected_status: 'AwaitingVerification',
  });
}

// ---------------------------------------------------------------------------------------------
// Moderator: reported social content (REQ-11.3, REQ-11.4)
// ---------------------------------------------------------------------------------------------

export type ModerationItem = {
  target_type: 'post' | 'comment';
  target_id: number;
  author_id: string;
  author_name: string;
  excerpt: string;
  report_count: number;
  reasons: string[];
  first_reported_at: string;
};

export type ContentAction = 'dismiss' | 'hide' | 'delete';
export type UserAction = 'none' | 'warn' | 'suspend' | 'ban';

/** RPC: admin_moderation_queue() → ModerationItem[] ordered by report_count desc (REQ-11.3). */
export function moderationQueue() {
  return rpc<ModerationItem[]>('admin_moderation_queue');
}

/** RPC: admin_moderate_content(p_target_type, p_target_id, p_content_action, p_user_action, p_note). */
export function moderateContent(item: Pick<ModerationItem, 'target_type' | 'target_id'>, content: ContentAction, user: UserAction, note: string | null) {
  return rpc<void>('admin_moderate_content', {
    p_target_type: item.target_type,
    p_target_id: item.target_id,
    p_content_action: content,
    p_user_action: user,
    p_note: note,
  });
}
