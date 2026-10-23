import { PlaceholderScreen } from '@/shared/components';

export default function RewardUI() {
  return (
    <PlaceholderScreen
      name="RewardUI"
      owner="Person B (Parth)"
      useCase="3.2 Log a recycling action and collect rewards"
      leading="close"
      links={[
        { label: 'Share to feed', href: '/feed/compose' },
      ]}
    />
  );
}
