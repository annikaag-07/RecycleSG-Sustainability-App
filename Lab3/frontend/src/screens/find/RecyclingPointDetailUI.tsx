import { PlaceholderScreen } from '@/shared/components';

export default function RecyclingPointDetailUI() {
  return (
    <PlaceholderScreen
      name="RecyclingPointDetailUI"
      owner="Person A (Pranav)"
      useCase="2.2 View recycling point details and get directions"
      leading="back"
      links={[
        { label: 'Directions', href: '/find/directions/1' },
        { label: 'Report an issue', href: '/find/report/1' },
        { label: 'Check in here', href: '/find/check-in/1' },
      ]}
    />
  );
}
