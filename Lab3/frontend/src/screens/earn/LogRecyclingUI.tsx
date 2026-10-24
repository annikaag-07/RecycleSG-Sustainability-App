import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { api, toApiError, type CheckIn, type RecyclingAction, type RecyclingPointDetail } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { AppText, Banner, Button, Card, Chip, EmptyState, Header, Screen } from '@/shared/components';
import { formatDistance } from '@/shared/geo';
import { pointStream } from '@/shared/materials';
import { colors, radius, spacing } from '@/shared/theme';
import { PointTypeTile } from '@/screens/find/PointBits';
import { pointTitle } from '@/screens/find/pointDisplay';
import { dropGuidance } from './guidance';
import { LOG_WINDOW_MIN, MAX_QUANTITY, POINTS_PER_ITEM, logDeadline } from './rules';
import { clockTime, useNow } from './time';

type Load =
  | { kind: 'loading' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; checkIn: CheckIn; point: RecyclingPointDetail; logged: RecyclingAction[] };

type Photo = { uri: string; base64: string; mimeType: string };

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true, exif: false };
// The camera isn't reliably available in a browser, so web picks a file (which a phone browser can take with the camera).
const HAS_CAMERA = Platform.OS !== 'web';

/** UC 3.2 steps 1–7: what went in the bin, how many, and what it will earn once verified. */
export default function LogRecyclingUI() {
  const { checkInId: checkInIdParam } = useLocalSearchParams<{ checkInId: string }>();
  const checkInId = Number(checkInIdParam);
  const { user } = useAuth();
  const now = useNow();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [materialId, setMaterialId] = useState<number>();
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [photo, setPhoto] = useState<Photo>();
  const [photoError, setPhotoError] = useState<string>();
  const [cameraDenied, setCameraDenied] = useState(false);
  // The server's clock decides expiry; this catches the case where the device clock disagrees.
  const [expiredOnServer, setExpiredOnServer] = useState(false);

  const fetchData = useCallback(async () => {
    if (!Number.isInteger(checkInId)) return setLoad({ kind: 'notFound' });
    setLoad({ kind: 'loading' });
    try {
      // RLS returns only the user's own rows, so someone else's check-in ID reads as not found.
      const [checkIns, actions] = await Promise.all([api.checkins.listMyCheckIns(20), api.checkins.listMyRecyclingActions(50)]);
      const checkIn = checkIns.find((c) => c.id === checkInId);
      if (!checkIn) return setLoad({ kind: 'notFound' });
      const point = await api.points.getPointDetail(checkIn.recycling_point_id);
      setLoad({ kind: 'ready', checkIn, point, logged: actions.filter((a) => a.check_in_id === checkInId) });
    } catch (e) {
      setLoad({ kind: 'error', message: toApiError(e).message });
    }
  }, [checkInId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (load.kind === 'loading') {
    return (
      <Screen>
        <Header title="Log your recycling" leading="back" />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </Screen>
    );
  }
  if (load.kind === 'notFound') {
    return (
      <Screen>
        <Header title="Log your recycling" leading="back" />
        <EmptyState icon="map-pin" title="This check-in isn't available" message="Recycling is logged against a check-in made in the last few minutes. Check in at the bin to start." />
        <Button label="Back to Find" onPress={() => router.replace('/find')} />
      </Screen>
    );
  }
  if (load.kind === 'error') {
    return (
      <Screen>
        <Header title="Log your recycling" leading="back" />
        <Banner tone="error" title="Couldn't load your check-in">
          {load.message}
        </Banner>
        <Button label="Try again" onPress={fetchData} />
      </Screen>
    );
  }

  const { checkIn, point, logged } = load;
  const { title } = pointTitle(point.name, point.address);
  const deadline = logDeadline(checkIn.checked_in_at);
  const expired = expiredOnServer || now >= deadline;
  const minutesLeft = Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / 60_000));
  const loggedIds = new Set(logged.map((a) => a.material_type_id));
  const material = point.materials.find((m) => m.id === materialId && !loggedIds.has(m.id));
  const guidance = material && dropGuidance(material.name);
  const points = quantity * POINTS_PER_ITEM;

  // UC 3.2 step 2 and AC.3 (retake).
  const pickPhoto = async (source: 'camera' | 'library') => {
    setPhotoError(undefined);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return setCameraDenied(true);
      }
      const result =
        source === 'camera' ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
      const asset = result.canceled ? undefined : result.assets[0];
      if (!asset) return;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      if (!asset.base64) return setPhotoError('Couldn’t read that photo. Try another one.');
      if (!api.photos.PHOTO_TYPES.includes(mimeType)) return setPhotoError('Use a JPEG, PNG or WebP photo.');
      if ((asset.base64.length * 3) / 4 > api.photos.MAX_PHOTO_BYTES) {
        return setPhotoError('That photo is over 5 MB. Retake it, or choose a smaller one.');
      }
      setCameraDenied(false);
      setPhoto({ uri: asset.uri, base64: asset.base64, mimeType });
    } catch (e) {
      setPhotoError(toApiError(e).message);
    }
  };

  const goToReward = (actionId: number) =>
    router.replace({ pathname: '/find/reward/[actionId]', params: { actionId: String(actionId) } });

  const onSubmit = async () => {
    if (!material || !photo || !user) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      // The photo goes up first, so a failed upload logs nothing and the whole thing can simply be retried (UC 3.2.EX.3).
      await api.photos.uploadRecyclingPhoto(user.id, checkIn.id, material.id, photo);
    } catch (e) {
      const err = toApiError(e);
      setSubmitError(
        err.isNetwork
          ? `Couldn't upload the photo, so nothing was logged. Try again before ${clockTime(deadline)}.`
          : `The photo didn't upload, so nothing was logged. ${err.message}`,
      );
      setSubmitting(false);
      return;
    }
    try {
      goToReward(await api.checkins.submitRecyclingActivity(checkIn.id, material.id, quantity));
    } catch (e) {
      const err = toApiError(e);
      // The backend raises plain exceptions, so its message text is the only way to tell these apart.
      if (err.message === 'Activity already submitted for this material') {
        // A retry after a lost response: the first attempt went through, so show that one (NFR-QUAL-06).
        const actions = await api.checkins.listMyRecyclingActions(50).catch(() => []);
        const existing = actions.find((a) => a.check_in_id === checkIn.id && a.material_type_id === material.id);
        if (existing) return goToReward(existing.id);
      }
      if (err.message === 'Check-in has expired') {
        setExpiredOnServer(true);
        return;
      }
      // UC 3.2.EX.1 asks for an offline queue, but the server only accepts a log within 15 minutes of the
      // check-in, so a queued log would usually be refused on upload. Keep the form and offer a retry instead.
      setSubmitError(
        err.isNetwork ? `Couldn't reach the server, so nothing was logged. Try again before ${clockTime(deadline)}.` : err.message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <Header title="Log your recycling" leading="back" />

      <View style={styles.pointRow}>
        <PointTypeTile stream={pointStream(point.materials.map((m) => m.name))} />
        <View style={styles.fill}>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="small" color="textMuted">
            Checked in at {clockTime(new Date(checkIn.checked_in_at))}
            {checkIn.distance_meters != null ? ` · ${formatDistance(checkIn.distance_meters)} from the bin` : ''}
          </AppText>
        </View>
      </View>

      {expired ? (
        // UC 3.2.EX.4: a stale check-in is not accepted; ask for a fresh one.
        <>
          <Banner tone="warning" title="This check-in has expired">
            {`Recycling has to be logged within ${LOG_WINDOW_MIN} min of checking in. Check in again at the bin to log this drop.`}
          </Banner>
          <Button label="Check in again" onPress={() => router.replace(`/find/check-in/${point.id}`)} />
        </>
      ) : (
        <>
          <AppText variant="small" color="textMuted">
            Log within {minutesLeft} min (until {clockTime(deadline)}).
          </AppText>

          <Card label="Photo">
            {photo ? (
              <>
                <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo of your drop" />
                {/* UC 3.2 step 2: the photo carries the point and the position locked at check-in. */}
                <View style={styles.photoTag}>
                  <Feather name="map-pin" size={14} color={colors.textMuted} />
                  <AppText variant="small" color="textMuted" style={styles.fill}>
                    {title} · location locked at check-in
                  </AppText>
                </View>
                <View style={styles.photoActions}>
                  {HAS_CAMERA && <Button label="Retake" icon="camera" variant="secondary" style={styles.fill} onPress={() => pickPhoto('camera')} />}
                  <Button
                    label={HAS_CAMERA ? 'Library' : 'Choose another'}
                    icon="image"
                    variant="secondary"
                    style={styles.fill}
                    onPress={() => pickPhoto('library')}
                  />
                </View>
              </>
            ) : (
              <>
                <AppText color="textMuted">Take a photo of what you're putting in. It's the evidence the drop is checked against.</AppText>
                {HAS_CAMERA && <Button label="Take a photo" icon="camera" onPress={() => pickPhoto('camera')} />}
                <Button
                  label={HAS_CAMERA ? 'Choose from library' : 'Add a photo'}
                  icon="image"
                  variant={HAS_CAMERA ? 'secondary' : 'primary'}
                  onPress={() => pickPhoto('library')}
                />
              </>
            )}
            {cameraDenied && (
              // UC 3.2.EX.2: say why the photo is needed, and offer the settings or another way in.
              <Banner tone="warning" title="Camera access is off">
                A photo is needed as evidence for a rewarded drop. Turn on camera access in Settings, or choose a photo from your
                library.
              </Banner>
            )}
            {cameraDenied && <Button label="Open Settings" variant="ghost" onPress={() => Linking.openSettings()} />}
            {photoError && <AppText color="danger">{photoError}</AppText>}
          </Card>

          <Card label="What did you put in?">
            {point.materials.length === 0 ? (
              // The server refuses any material the point doesn't list, so there's nothing to offer.
              <AppText color="textMuted">This point doesn't list what it accepts, so recycling can't be logged here.</AppText>
            ) : (
              <View style={styles.chips}>
                {point.materials.map((m) =>
                  loggedIds.has(m.id) ? (
                    <Chip key={m.id} label={`${m.name} · logged`} />
                  ) : (
                    <Chip key={m.id} label={m.name} selected={m.id === materialId} onPress={() => setMaterialId(m.id)} />
                  ),
                )}
              </View>
            )}
            {logged.length > 0 && (
              // UC 3.2.AC.2: several streams in one visit, one log per material.
              <AppText variant="small" color="textFaint">
                Each material can be logged once per check-in.
              </AppText>
            )}
          </Card>

          <Card label="How many items?">
            <View style={styles.stepper}>
              <StepButton icon="minus" label="One fewer item" disabled={quantity <= 1} onPress={() => setQuantity((q) => q - 1)} />
              <AppText variant="title" style={styles.qty} accessibilityLiveRegion="polite" accessibilityLabel={`${quantity} items`}>
                {quantity}
              </AppText>
              <StepButton
                icon="plus"
                label="One more item"
                disabled={quantity >= MAX_QUANTITY}
                onPress={() => setQuantity((q) => q + 1)}
              />
            </View>
          </Card>

          {guidance && (
            // UC 3.2 step 5: the contamination advice appears at the moment of the drop.
            <Card label="Before you drop it">
              <AppText>{guidance.tip}</AppText>
              {guidance.why && (
                <AppText variant="small" color="textMuted">
                  {guidance.why}
                </AppText>
              )}
            </Card>
          )}

          {submitError && (
            <Banner tone="error" title="Not logged">
              {submitError}
            </Banner>
          )}

          {/* UC 3.2 step 6: the button says what the drop is worth, so there's no surprise at the end. */}
          <Button
            label={
              !material
                ? 'Choose what you put in'
                : !photo
                  ? 'Add a photo to log this'
                  : `Log ${quantity} ${material.name.toLowerCase()} item${quantity === 1 ? '' : 's'} · ${points} points`
            }
            disabled={!material || !photo}
            loading={submitting}
            onPress={onSubmit}
          />
          <AppText variant="small" color="textFaint" style={styles.center}>
            Points are added once the drop is verified, and aren't shown as earned before then.
          </AppText>
        </>
      )}
    </Screen>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'minus' | 'plus';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.stepBtn, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
    >
      <Feather name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { minWidth: 56, textAlign: 'center' },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  photoTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  photoActions: { flexDirection: 'row', gap: spacing.md },
});
