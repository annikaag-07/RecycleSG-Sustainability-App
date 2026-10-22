import type { ReactNode } from 'react';
import { router, type Href } from 'expo-router';

import { Screen } from './Screen';
import { Header } from './Header';
import { Card } from './Card';
import { AppText } from './AppText';
import { Button } from './Button';

type Props = {
  /** Boundary class name from the Lab 2 design, e.g. "MapUI". */
  name: string;
  owner: 'Person A (Pranav)' | 'Person B (Parth)';
  useCase?: string;
  leading?: 'back' | 'close' | 'none';
  /** Temporary navigation so the shell can be clicked through before screens exist. */
  links?: { label: string; href: Href }[];
  children?: ReactNode;
};

/** Stand-in used until the real screen is built. Replace the whole file's contents when implementing the screen. */
export function PlaceholderScreen({ name, owner, useCase, leading = 'back', links = [], children }: Props) {
  return (
    <Screen scroll>
      <Header title={name} leading={leading} />
      <Card label="Not built yet">
        <AppText color="textMuted">Owner: {owner}</AppText>
        {useCase && <AppText color="textMuted">Use case: {useCase}</AppText>}
      </Card>
      {links.map((l) => (
        <Button key={l.label} label={l.label} variant="secondary" onPress={() => router.push(l.href)} />
      ))}
      {children}
    </Screen>
  );
}
