import { PlaceholderScreen } from '@/shared/components';

export default function ProfileUI() {
  return (
    <PlaceholderScreen
      name="ProfileUI"
      owner="Person A (Pranav)"
      useCase="6.1 Manage profile, privacy and notification settings"
      leading="none"
      links={[
        { label: 'Settings', href: '/you/settings' },
        { label: 'Environmental impact', href: '/you/impact' },
      ]}
    />
  );
}
