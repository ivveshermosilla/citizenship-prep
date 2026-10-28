-- Explicitly deny all direct client-role row access as defense in depth.
-- Capability-gated SECURITY DEFINER routines are the only application path.
create policy sessions_deny_direct_client_access
on game_private.sessions
for all
to anon, authenticated
using (false)
with check (false);
