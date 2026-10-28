// Recycling photos go to the private `recycling-photos` bucket, under the signed-in user's own folder (storage RLS).
import { supabase } from './supabase';
import { ApiError, toApiError } from './errors';
import { newRequestId } from './proposed';

const BUCKET = 'recycling-photos';
/** The bucket's limits (recycling_photo_storage migration). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type PhotoFile = { base64: string; mimeType: string };

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * A fresh object per upload attempt prevents a retaken photo from reusing stale bytes.
 * The activity RPC enforces one activity per material/check-in and stores this exact path.
 */
export function recyclingPhotoPath(userId: string, checkInId: number, materialTypeId: number, mimeType: string) {
  return `${userId}/check-in-${checkInId}-material-${materialTypeId}-${newRequestId()}.${EXT[mimeType] ?? 'jpg'}`;
}

/**
 * Uploads the chosen photo and returns its path. Never overwrite an existing photo
 * or silently treat an object collision as success. Failed submissions can leave
 * unused objects; automatic cleanup is outside the classroom-demo scope.
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
  if (error) throw toApiError(error);
  return path;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/^data:[^,]*,/, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
