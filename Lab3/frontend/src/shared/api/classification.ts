import { Platform } from 'react-native';
import { ApiError } from './errors';
import type { PhotoFile } from './photos';

export type ClassificationResult = {
  status: 'ok' | 'unsure' | 'unavailable';
  material: string | null;
  confidence: number;
};

/** A suggestion only. This endpoint never stores an activity or awards points. */
export async function classifyPhoto(photo: PhotoFile & { uri: string }, signal: AbortSignal): Promise<ClassificationResult> {
  const url = process.env.EXPO_PUBLIC_VERIFICATION_URL;
  if (!url) throw new ApiError('Photo recognition is not configured. Choose the material manually.');
  const body = new FormData();
  const name = `recycling.${photo.mimeType === 'image/png' ? 'png' : photo.mimeType === 'image/webp' ? 'webp' : 'jpg'}`;
  if (Platform.OS === 'web') {
    const binary = atob(photo.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    body.append('file', new Blob([bytes.buffer], { type: photo.mimeType }), name);
  } else {
    // React Native's FormData uploads local file URIs; DOM typings describe only Blob.
    body.append('file', { uri: photo.uri, type: photo.mimeType, name } as unknown as Blob);
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel);
  if (signal.aborted) cancel();
  const timeout = setTimeout(cancel, 20000);
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/classify`, {
      method: 'POST', body, signal: controller.signal,
    });
    if (!response.ok) throw new Error('Recognition request failed');
    const result = await response.json();
    if (!['ok', 'unsure', 'unavailable'].includes(result.status)
      || (result.status === 'ok' && typeof result.material !== 'string')) throw new Error('Invalid recognition result');
    return result as ClassificationResult;
  } catch {
    throw new ApiError('Photo recognition is unavailable. Choose the material manually, or retry.', 'network');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
