import { Header, Screen } from '@/shared/components';
import { PostsNotOnServer } from './PostsNotOnServer';

/** UC 5.1 (share a recycling activity as a post). Waiting on a posts backend and a post photo bucket. */
export default function PostComposerUI() {
  return (
    <Screen>
      <Header title="New post" leading="close" />
      <PostsNotOnServer />
    </Screen>
  );
}
