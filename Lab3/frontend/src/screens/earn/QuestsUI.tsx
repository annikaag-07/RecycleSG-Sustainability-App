import { PlaceholderScreen } from '@/shared/components';

export default function QuestsUI() {
  return (
    <PlaceholderScreen
      name="QuestsUI"
      owner="Person B (Parth)"
      useCase="4.1 Track quests, streaks and badges"
      leading="none"
      links={[
        { label: 'Collection', href: '/quests/collection' },
      ]}
    />
  );
}
