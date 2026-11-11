import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { api } from '@/shared/api';
import { useAuth } from '@/shared/auth/AuthProvider';
import { colors } from '@/shared/theme';

// Downloaded photos for this session, per viewer, so scrolling back up or reopening a post doesn't download them
// again. Kept small: each one is a whole photo in memory.
const CACHE_SIZE = 40;
const cache = new Map<string, Promise<string>>();

function load(key: string, path: string): Promise<string> {
  let p = cache.get(key);
  if (!p) {
    p = api.photos.downloadPostPhoto(path);
    cache.set(key, p);
    // A failed download is forgotten, so the photo is tried again next time it's shown.
    p.catch(() => cache.delete(key));
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/** A photo from the private post-photos bucket, downloaded with the viewer's session. */
export function PostPhoto({ path, label, style }: { path: string; label: string; style?: StyleProp<ImageStyle> }) {
  const { user } = useAuth();
  const key = `${user?.id ?? 'guest'}:${path}`;
  const [shown, setShown] = useState<{ key: string; uri?: string; failed?: boolean }>({ key });

  useEffect(() => {
    let live = true;
    load(key, path).then(
      (uri) => live && setShown({ key, uri }),
      () => live && setShown({ key, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [key, path]);

  const current = shown.key === key ? shown : { key };
  if (current.uri) return <Image source={{ uri: current.uri }} style={[styles.photo, style]} resizeMode="cover" accessibilityLabel={label} />;
  return (
    <View style={[styles.photo, styles.placeholder, style]} accessibilityLabel={current.failed ? `${label} couldn't load` : label}>
      {current.failed ? <Feather name="image" size={28} color={colors.textFaint} /> : <ActivityIndicator color={colors.textMuted} />}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceRaised },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
