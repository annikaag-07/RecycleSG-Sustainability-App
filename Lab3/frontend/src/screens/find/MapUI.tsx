import { PlaceholderScreen } from '@/shared/components';

export default function MapUI() {
  return (
    <PlaceholderScreen
      name="MapUI"
      owner="Person A (Pranav)"
      useCase="2.1 Find a recycling point for an item"
      leading="none"
      links={[
        { label: 'Search (e.g. old laptop)', href: '/find/search' },
        { label: 'Point detail (sample id 1)', href: '/find/point/1' },
        { label: 'Check in at point 1', href: '/find/check-in/1' },
        { label: 'Admin: milestone verification', href: '/admin/milestones' },
        { label: 'Admin: moderation queue', href: '/admin/moderation' },
      ]}
    />
  );
}
