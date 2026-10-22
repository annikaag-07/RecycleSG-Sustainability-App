import { PlaceholderScreen } from '@/shared/components';

export default function RegistrationUI() {
  return (
    <PlaceholderScreen
      name="RegistrationUI"
      owner="Person A (Pranav)"
      useCase="1.1 Register an account"
      leading="back"
      links={[
        { label: 'Already have an account? Log in', href: '/login' },
      ]}
    />
  );
}
