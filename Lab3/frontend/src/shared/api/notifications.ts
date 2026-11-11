// The in-app inbox and which kinds of notification the server creates (PROGRESS_API.md). Nothing is pushed to the
// phone: the app reads the inbox when it's open.
import { supabase } from './supabase';
import { unwrap } from './errors';
import type { AppNotification, NotificationPreferences } from './types';

/** Newest first. Pass the last ID shown as `beforeId` for older ones. The server caps a page at 100. */
export async function listMyNotifications(beforeId?: number, limit = 20): Promise<AppNotification[]> {
  return unwrap(await supabase.rpc('list_my_notifications', { p_before_id: beforeId ?? null, p_limit: limit }));
}

/** Marking one twice keeps the first time it was read. */
export async function markNotificationRead(id: number): Promise<void> {
  unwrap(await supabase.rpc('mark_notification_read', { p_id: id }));
}

/** Defaults: social and progress on, streak reminder off. */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const rows = unwrap<NotificationPreferences[]>(await supabase.rpc('get_my_notification_preferences'));
  return rows[0] ?? { social: true, progress: true, streak_reminder: false };
}

/** The server needs all three switches every time. Changes apply to notifications created from now on. */
export async function setNotificationPreferences(p: NotificationPreferences): Promise<void> {
  unwrap(
    await supabase.rpc('set_notification_preferences', {
      p_social: p.social,
      p_progress: p.progress,
      p_streak_reminder: p.streak_reminder,
    }),
  );
}
