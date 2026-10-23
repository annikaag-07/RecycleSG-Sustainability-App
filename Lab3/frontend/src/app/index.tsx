import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '@/shared/auth/AuthProvider';
import { colors } from '@/shared/theme';

/** Entry: signed-in users and guests go to Find; everyone else starts at Log in (dialog map: "Log in, or browse as guest"). */
export default function Index() {
  const { loading, user, isGuest, passwordRecovery } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }
  if (passwordRecovery) return <Redirect href="/login" />;
  return <Redirect href={user || isGuest ? '/find' : '/login'} />;
}
