import { PlaceholderScreen } from '@/shared/components';

export default function LoginUI() {
  return (
    <PlaceholderScreen
      name="LoginUI"
      owner="Person A (Pranav)"
      useCase="1.2 Log in to an existing account"
      leading="none"
      links={[
        { label: 'Create an account', href: '/register' },
        { label: 'Continue as guest', href: '/find' },
      ]}
    />
  );
}
