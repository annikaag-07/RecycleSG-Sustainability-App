import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';

import { colors } from '@/shared/theme';

type IconName = ComponentProps<typeof Feather>['name'];

// Order and labels match the mockups' tab bar: Find · Quests · Feed · Ranks · You.
const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'find', title: 'Find', icon: 'map' },
  { name: 'quests', title: 'Quests', icon: 'zap' },
  { name: 'feed', title: 'Feed', icon: 'message-circle' },
  { name: 'ranks', title: 'Ranks', icon: 'award' },
  { name: 'you', title: 'You', icon: 'user' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ color, size }) => <Feather name={t.icon} size={size} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
