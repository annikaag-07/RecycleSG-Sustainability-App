import { Header, Screen } from '@/shared/components';
import { PostsNotOnServer } from './PostsNotOnServer';

/** UC 5.2 steps 5–6 (a post and its comments). Waiting on a posts and comments backend. */
export default function PostDetailUI() {
  return (
    <Screen>
      <Header title="Post" leading="back" />
      <PostsNotOnServer />
    </Screen>
  );
}
