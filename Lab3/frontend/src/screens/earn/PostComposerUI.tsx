import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { api, toApiError, type PostVisibility } from '@/shared/api';
import { MAX_CAPTION, MAX_PHOTOS } from '@/shared/api/social';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, Checkbox, Chip, EmptyState, Header, Screen, TextField } from '@/shared/components';
import { colors, radius, spacing } from '@/shared/theme';
import { pointTitle } from '@/screens/find/pointDisplay';
import { linkableCheckIn, parseTags, postProblem, type LinkableCheckIn } from './postRules';
import { clockTime } from './time';

type Photo = { uri: string; base64: string; mimeType: string };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true, exif: false };
// The camera isn't reliably available in a browser, so web picks a file (which a phone browser can take with the camera).
const HAS_CAMERA = Platform.OS !== 'web';

type Link = LinkableCheckIn & { place: string | null };

/**
 * UC 5.1: share recycling as a post with one to eight photos, a caption, hashtags, an optional link to a verified
 * check-in, and who can see it. Opened from the feed, or from a reward with `checkInId` to link that drop.
 */
export default function PostComposerUI() {
  const { checkInId: checkInParam } = useLocalSearchParams<{ checkInId?: string }>();
  const wantedCheckIn = checkInParam ? Number(checkInParam) : undefined;
  const { user, isVerified } = useAuth();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState<string>();
  const [cameraDenied, setCameraDenied] = useState(false);
  const [caption, setCaption] = useState('');
  const [tagText, setTagText] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [link, setLink] = useState<Link | null>();
  // Coming from a reward means "share this drop"; otherwise the latest drop is offered, not attached (mockup note).
  const [linked, setLinked] = useState(wantedCheckIn != null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  // Photos already uploaded by an earlier attempt, so a retry doesn't upload them again.
  const uploaded = useRef(new Map<string, string>());
  // One request ID per set of fields: a retry of the same post can't create it twice (NFR-QUAL-06), and a changed
  // post gets a new ID because the server refuses a reused ID with different fields.
  const attempt = useRef<{ key: string; requestId: string } | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId || !isVerified) return;
    let live = true;
    (async () => {
      try {
        const [checkIns, actions, rewards] = await Promise.all([
          api.checkins.listMyCheckIns(20),
          api.checkins.listMyRecyclingActions(50),
          api.checkins.listMyRewards(50),
        ]);
        const found = linkableCheckIn(checkIns, actions, rewards, wantedCheckIn);
        if (!found) return live && setLink(null);
        const names = await api.social.getPointNames([found.checkIn.recycling_point_id]).catch(() => new Map());
        const point = names.get(found.checkIn.recycling_point_id);
        if (live) setLink({ ...found, place: point ? pointTitle(point.name, point.address).title : null });
      } catch {
        // Linking is optional; the post works without it.
        if (live) setLink(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, isVerified, wantedCheckIn]);

  if (!user) {
    return (
      <Screen>
        <Header title="New post" leading="close" />
        <EmptyState
          icon="user-check"
          title="Posting needs an account"
          message="Posts are shared under your name, so they're tied to an account. Reading the feed works without one."
        />
        <Button label="Log in" onPress={() => router.push('/login')} />
        <Button label="Create an account" variant="secondary" onPress={() => router.push('/register')} />
      </Screen>
    );
  }
  if (!isVerified) {
    return (
      <Screen>
        <Header title="New post" leading="close" />
        <EmptyState icon="mail" title="Verify your email to post" message={`Open the link we sent to ${user.email}, then come back here.`} />
      </Screen>
    );
  }

  const room = MAX_PHOTOS - photos.length;

  const addPhotos = async (source: 'camera' | 'library') => {
    setPhotoError(undefined);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return setCameraDenied(true);
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
          : await ImagePicker.launchImageLibraryAsync({ ...PICKER_OPTIONS, allowsMultipleSelection: true, selectionLimit: room });
      if (result.canceled) return;
      setCameraDenied(false);
      const picked: Photo[] = [];
      const skipped: string[] = [];
      for (const asset of result.assets.slice(0, room)) {
        const mimeType = asset.mimeType ?? 'image/jpeg';
        if (photos.some((p) => p.uri === asset.uri) || picked.some((p) => p.uri === asset.uri)) skipped.push('one was already added');
        else if (!asset.base64) skipped.push('one couldn’t be read');
        else if (!api.photos.PHOTO_TYPES.includes(mimeType)) skipped.push('only JPEG, PNG and WebP work');
        else if ((asset.base64.length * 3) / 4 > api.photos.MAX_PHOTO_BYTES) skipped.push('one was over 5 MB');
        else picked.push({ uri: asset.uri, base64: asset.base64, mimeType });
      }
      if (result.assets.length > room) skipped.push(`a post holds up to ${MAX_PHOTOS}`);
      setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS));
      if (skipped.length) setPhotoError(`Some photos weren’t added: ${[...new Set(skipped)].join(', ')}.`);
    } catch (e) {
      setPhotoError(toApiError(e).message);
    }
  };

  const removePhoto = (uri: string) => setPhotos((p) => p.filter((x) => x.uri !== uri));

  const { tags } = parseTags(tagText);
  const problem = postProblem({ photoCount: photos.length, caption, tagText }, MAX_CAPTION);
  const linkedCheckIn = link?.kind === 'verified' && linked ? link.checkIn.id : null;

  const onPost = async () => {
    if (problem) return setSubmitError(problem);
    setSubmitting(true);
    setSubmitError(undefined);
    const photoPaths: string[] = [];
    try {
      // Photos go up first: the server checks they're there before it accepts the post.
      for (const photo of photos) {
        let path = uploaded.current.get(photo.uri);
        if (!path) {
          path = await api.photos.uploadPostPhoto(user.id, photo);
          uploaded.current.set(photo.uri, path);
        }
        photoPaths.push(path);
      }
    } catch (e) {
      setSubmitError(`A photo didn't upload, so nothing was posted. ${toApiError(e).message}`);
      setSubmitting(false);
      return;
    }
    const fields = { photoPaths, caption: caption.trim(), tags, visibility, checkInId: linkedCheckIn };
    const key = JSON.stringify(fields);
    if (attempt.current?.key !== key) attempt.current = { key, requestId: api.proposed.newRequestId() };
    try {
      const id = await api.social.createPost({ requestId: attempt.current.requestId, ...fields });
      router.replace({ pathname: '/feed/post/[id]', params: { id: String(id) } });
    } catch (e) {
      const err = toApiError(e);
      setSubmitError(
        err.isNetwork
          ? 'Couldn’t reach the server, so the post may or may not have gone through. Try again: it won’t be posted twice.'
          : err.message,
      );
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <Header title="New post" leading="close" />

      <View style={styles.grid}>
        {photos.map((p, i) => (
          <View key={p.uri} style={styles.tile}>
            <Image source={{ uri: p.uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel={`Photo ${i + 1}`} />
            <Pressable
              onPress={() => removePhoto(p.uri)}
              hitSlop={8}
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${i + 1}`}
            >
              <Feather name="x" size={16} color={colors.text} />
            </Pressable>
          </View>
        ))}
        {room > 0 && (
          <Pressable
            onPress={() => addPhotos('library')}
            style={[styles.tile, styles.add]}
            accessibilityRole="button"
            accessibilityLabel="Add photos from your library"
          >
            <Feather name="plus" size={26} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      <View style={styles.photoButtons}>
        {HAS_CAMERA && room > 0 && <Button label="Take a photo" icon="camera" variant="secondary" onPress={() => addPhotos('camera')} style={styles.fill} />}
        {room > 0 && <Button label="Choose photos" icon="image" variant="secondary" onPress={() => addPhotos('library')} style={styles.fill} />}
      </View>
      <AppText variant="small" color="textFaint">
        {photos.length === 0 ? `Add one to ${MAX_PHOTOS} photos.` : `${photos.length} of ${MAX_PHOTOS} photos. The first one shows in the feed.`}
      </AppText>
      {cameraDenied && (
        <Banner tone="warning" title="Camera access is off">
          Allow camera access for Expo Go in Settings, or choose photos from your library.
        </Banner>
      )}
      {photoError && <Banner tone="warning">{photoError}</Banner>}

      <TextField
        label="Caption"
        value={caption}
        onChangeText={setCaption}
        placeholder="What did you recycle?"
        multiline
        maxLength={MAX_CAPTION}
        style={styles.caption}
        hint={caption.length > MAX_CAPTION - 200 ? `${caption.length} / ${MAX_CAPTION}` : undefined}
      />
      <TextField
        label="Hashtags"
        value={tagText}
        onChangeText={setTagText}
        placeholder="#recyclesg #plastic"
        autoCapitalize="none"
        autoCorrect={false}
        hint="Letters, numbers and underscores. Separate them with spaces."
      />
      {tags.length > 0 && (
        <View style={styles.chips}>
          {tags.map((t) => (
            <Chip key={t} label={`#${t}`} selected />
          ))}
        </View>
      )}

      {link && (
        <Card label="Link your check-in">
          {link.kind === 'verified' ? (
            <Checkbox
              checked={linked}
              onChange={setLinked}
              accessibilityLabel={`Link ${link.place ?? 'your drop'}, ${link.items} items, ${link.points} Eco Points`}
            >
              <AppText variant="bodyStrong">{`${link.place ?? 'Your drop'} · ${dayTime(new Date(link.checkIn.checked_in_at))}`}</AppText>
              <AppText variant="small" color="textMuted">
                {`${link.items} item${link.items === 1 ? '' : 's'} · +${link.points} Eco Points`}
              </AppText>
            </Checkbox>
          ) : (
            <AppText variant="small" color="textMuted">
              {`${link.place ?? 'This drop'} is still being verified, so it can't be linked yet. Post now without it, or share it from the reward screen once it's verified.`}
            </AppText>
          )}
        </Card>
      )}

      <View style={styles.gap}>
        <AppText variant="small" color="textMuted" style={styles.bold}>
          Visible to
        </AppText>
        <View style={styles.chips}>
          <Chip label="Public" selected={visibility === 'public'} onPress={() => setVisibility('public')} />
          <Chip label="Followers" selected={visibility === 'followers'} onPress={() => setVisibility('followers')} />
        </View>
        <AppText variant="small" color="textFaint">
          {visibility === 'public'
            ? 'Anyone can see it in Discover, as long as your profile is public.'
            : 'Only people you’ve approved as followers can see it.'}
        </AppText>
      </View>

      {submitError && (
        <Banner tone="error" title="Not posted">
          {submitError}
        </Banner>
      )}
      <Button label="Post" onPress={onPost} loading={submitting} disabled={!!problem} accessibilityHint={problem ?? undefined} />
      {problem && photos.length > 0 && (
        <AppText variant="small" color="textMuted">
          {problem}
        </AppText>
      )}
    </Screen>
  );
}

/** "Today, 19:12", "Yesterday, 18:40", "3 Nov, 09:05". */
function dayTime(d: Date, now = new Date()) {
  const day = (x: Date) => x.toLocaleDateString('en-SG');
  const yesterday = new Date(now.getTime() - 86_400_000);
  const label =
    day(d) === day(now) ? 'Today' : day(d) === day(yesterday) ? 'Yesterday' : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
  return `${label}, ${clockTime(d)}`;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bold: { fontWeight: '600' },
  gap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '31%', aspectRatio: 1, borderRadius: radius.sm, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,20,18,0.8)',
  },
  photoButtons: { flexDirection: 'row', gap: spacing.sm },
  caption: { minHeight: 88, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
