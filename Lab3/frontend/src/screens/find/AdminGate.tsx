import type { ReactNode } from 'react';
import { ActivityIndicator } from 'react-native';

import { useAuth } from '@/shared/auth/AuthProvider';
import { EmptyState, Header, Screen } from '@/shared/components';
import { colors } from '@/shared/theme';

/**
 * UC 7.1.EX.4: non-admins get a plain "not authorised" screen and never see the controls.
 * Admin status comes from the backend's is_app_admin(); the admin RPCs check it again server-side (NFR-SEC-09).
 */
export function AdminGate({ title, need, children }: { title: string; need: 'admin' | 'moderator'; children: ReactNode }) {
  const { user, isAdmin, isModerator, roleChecked } = useAuth();
  const allowed = need === 'admin' ? isAdmin : isModerator;
  if (user && !roleChecked) {
    return (
      <Screen>
        <Header title={title} leading="back" />
        <ActivityIndicator color={colors.text} />
      </Screen>
    );
  }
  if (!user || !allowed) {
    return (
      <Screen>
        <Header title={title} leading="back" />
        <EmptyState icon="lock" title="Administrators only" message="Your account doesn't have access to this page." />
      </Screen>
    );
  }
  return <>{children}</>;
}

/** Shown when the backend hasn't implemented the proposed endpoint yet. */
export function NotOnServerYet({ feature }: { feature: string }) {
  return (
    <EmptyState
      icon="server"
      title={`${feature} isn't set up on the server yet`}
      message="The screen is ready; it will work once the backend adds the endpoints listed in API_ENDPOINTS.md (Proposed endpoints)."
    />
  );
}
