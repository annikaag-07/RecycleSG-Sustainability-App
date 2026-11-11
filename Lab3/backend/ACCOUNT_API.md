# Account deletion and password policy

Call `await supabase.functions.invoke('delete-my-account', { method: 'POST' })` with the active session. The function accepts no account ID. A successful call returns HTTP 200 with `{"deleted":true}`. The existing Settings wrapper signs out locally and returns to login. HTTP 401 requires a fresh sign-in. HTTP 503 means cleanup needs a retry.

The server validates the token with Auth. It freezes new personal media uploads, removes owned recycling and post photos through Storage, and deletes the identity through the Auth admin API. If Storage is unavailable, the identity remains available to retry. The database retains milestone amounts with a null contributor ID. Owned profile, posts, comments and relationships are removed via foreign keys. Only the server runtime receives the service-role key.

The local Auth config requires at least eight characters with a letter and a digit. Set the same password length and character classes in the hosted Auth project when deploying. Existing users can sign in with their existing passwords. The policy applies to new and changed passwords.

## Integration checks

1. Apply migrations, serve or deploy the `delete-my-account` Edge Function and configure Auth. The function reads the runtime's Supabase URL, anon key and service-role key.
2. In a disposable test project, create a confirmed user, contribution and private photo. Call the function from that user's session. Check the account, profile and both media buckets. Verify that the milestone total is unchanged and a new sign-in fails.
3. Submit a short password, an all-letter password and an all-digit password directly to Auth. Each must fail. Try a valid password with a fresh address.
