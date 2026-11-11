// Recycling photos go to the private `recycling-photos` bucket and post photos to the private `post-photos` bucket,
// both under the signed-in user's own folder (storage RLS).
import { supabase } from './supabase';
import { ApiError, toApiError } from './errors';
import { newRequestId } from './proposed';

const BUCKET = 'recycling-photos';
const POST_BUCKET = 'post-photos';
/** Both buckets' limits (recycling_photo_storage and social_community migrations). */
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

/** A new object for every photo, so the server never mistakes it for one already attached to a post. */
export function postPhotoPath(userId: string, mimeType: string) {
  return `${userId}/${newRequestId()}.${EXT[mimeType] ?? 'jpg'}`;
}

/** Uploads one post photo and returns its path, for create_post. Same checks as a recycling photo. */
export async function uploadPostPhoto(userId: string, photo: PhotoFile): Promise<string> {
  if (!PHOTO_TYPES.includes(photo.mimeType)) {
    throw new ApiError('Use JPEG, PNG or WebP photos.', 'photo_type');
  }
  const bytes = base64ToBytes(photo.base64);
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new ApiError('One of the photos is over 5 MB. Remove it, or choose a smaller one.', 'photo_too_large');
  }
  const path = postPhotoPath(userId, photo.mimeType);
  const { error } = await supabase.storage.from(POST_BUCKET).upload(path, bytes, { contentType: photo.mimeType, upsert: false });
  if (error) throw toApiError(error);
  return path;
}

/**
 * A post photo as a data URI for <Image>. The bucket is private and has no public URLs: each download goes through
 * Storage with the viewer's own session, which checks the post is still visible to them.
 */
export async function downloadPostPhoto(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(POST_BUCKET).download(path);
  if (error) throw toApiError(error);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ApiError('Couldn’t read the photo.'));
    reader.readAsDataURL(data);
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/^data:[^,]*,/, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
