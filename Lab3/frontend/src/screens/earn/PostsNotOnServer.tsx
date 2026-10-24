import { router } from 'expo-router';

import { Button, EmptyState } from '@/shared/components';

/**
 * UC 5.1 and 5.2 posts, comments and likes need tables and endpoints the backend doesn't have. What it has is a feed of
 * verified recycling, which fills itself, so these screens point there instead.
 */
export function PostsNotOnServer() {
  return (
    <EmptyState
      icon="message-square"
      title="Posts aren't on the server yet"
      message="There's no backend for posts, comments or likes yet. Verified recycling already appears in the community feed by itself."
    >
      <Button label="Go to the feed" variant="secondary" onPress={() => router.replace('/feed')} />
    </EmptyState>
  );
}
