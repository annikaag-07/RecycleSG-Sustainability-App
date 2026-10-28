import { supabase } from './supabase';
import { unwrap } from './errors';
import type { ContributionResult, Milestone, MilestoneContribution } from './types';

/** Every milestone, including closed and rejected ones, newest first. Public. */
export async function listMilestones(): Promise<Milestone[]> {
  return unwrap(await supabase.rpc('list_milestones'));
}

/**
 * Spends available Eco Points (never lifetime points) on a milestone, in one transaction. Only what the target still
 * needs is taken. Idempotent on `clientRequestId`: a retry with the same ID and amount returns the first result instead
 * of deducting again, and the same ID with a different amount is refused. Needs a verified account.
 */
export async function contributeToMilestone(milestoneId: number, amount: number, clientRequestId: string): Promise<ContributionResult> {
  // A function returning TABLE comes back as an array of one row.
  const rows = unwrap<ContributionResult[]>(
    await supabase.rpc('contribute_to_milestone', {
      p_milestone_id: milestoneId,
      p_amount: amount,
      p_client_request_id: clientRequestId,
    }),
  );
  return rows[0]!;
}

/** The caller's contributions to every milestone, newest first. */
export async function listMyContributions(): Promise<MilestoneContribution[]> {
  return unwrap(await supabase.rpc('list_my_milestone_contributions'));
}
