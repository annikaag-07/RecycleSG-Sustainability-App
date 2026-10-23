import { PlaceholderScreen } from '@/shared/components';

export default function FeedUI() {
  return (
    <PlaceholderScreen
      name="FeedUI"
      owner="Person B (Parth)"
      useCase="5.2 Interact with the community feed"
      leading="none"
      links={[
        { label: 'New post', href: '/feed/compose' },
        { label: 'Post (sample id 1)', href: '/feed/post/1' },
      ]}
    />
  );
}
