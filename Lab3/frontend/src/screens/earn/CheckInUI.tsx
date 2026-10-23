import { PlaceholderScreen } from '@/shared/components';

export default function CheckInUI() {
  return (
    <PlaceholderScreen
      name="CheckInUI"
      owner="Person B (Parth)"
      useCase="3.1 Check in at a recycling point"
      leading="back"
      links={[
        { label: 'Continue to add a photo', href: '/find/log/1' },
      ]}
    />
  );
}
