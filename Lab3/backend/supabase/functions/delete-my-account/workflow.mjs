export async function deleteAccount(caller, admin) {
  const { data: identity, error: authError } = await caller.auth.getUser();
  if (authError || !identity.user) {
    throw Object.assign(new Error("Sign in again to delete your account"), { status: 401 });
  }
  const { error: freezeError } = await caller.rpc("begin_account_deletion");
  if (freezeError) throw freezeError;

  for (;;) {
    const { data: media, error } = await admin.rpc("deletion_media_batch", { p_user_id: identity.user.id });
    if (error) throw error;
    if (media.length === 0) break;
    const buckets = new Map();
    for (const { bucket_id, name } of media) {
      if (!buckets.has(bucket_id)) buckets.set(bucket_id, []);
      buckets.get(bucket_id).push(name);
    }
    for (const [bucket, names] of buckets) {
      const { error: storageError } = await admin.storage.from(bucket).remove(names);
      if (storageError) throw storageError;
    }
  }
  const { error } = await admin.auth.admin.deleteUser(identity.user.id);
  if (error && error.code !== "user_not_found") throw error;
}
