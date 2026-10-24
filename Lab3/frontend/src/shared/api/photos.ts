// Recycling photos go to the private `recycling-photos` bucket, under the signed-in user's own folder (storage RLS).
import { supabase } from './supabase';
import { ApiError, toApiError } from './errors';

const BUCKET = 'recycling-photos';
/** The bucket's limits (recycling_photo_storage migration). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type PhotoFile = { base64: string; mimeType: string };

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * `{user id}/check-in-{check-in id}-material-{material id}.{ext}`. The backend has no column the app can write the photo
 * path to, so the name is what ties a photo to its recycling activity: there's one activity per material per check-in.
 */
export function recyclingPhotoPath(userId: string, checkInId: number, materialTypeId: number, mimeType: string) {
  return `${userId}/check-in-${checkInId}-material-${materialTypeId}.${EXT[mimeType] ?? 'jpg'}`;
}

/**
 * Uploads the photo for one material on one check-in and returns its path. The bucket doesn't allow overwriting, so if a
 * photo is already there (an earlier attempt uploaded it but the log itself failed) that one is kept and this succeeds.
 */
export async function uploadRecyclingPhoto(userId: string, checkInId: number, materialTypeId: number, photo: PhotoFile): Promise<string> {
  if (!PHOTO_TYPES.includes(photo.mimeType)) {
    throw new ApiError('Use a JPEG, PNG or WebP photo.', 'photo_type');
  }
  const bytes = base64ToBytes(photo.base64);
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new ApiError('This photo is over 5 MB. Retake it, or choose a smaller one.', 'photo_too_large');
  }
  const path = recyclingPhotoPath(userId, checkInId, materialTypeId, photo.mimeType);
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: photo.mimeType, upsert: false });
  if (error && !/already exists/i.test(error.message)) throw toApiError(error);
  return path;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/^data:[^,]*,/, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
