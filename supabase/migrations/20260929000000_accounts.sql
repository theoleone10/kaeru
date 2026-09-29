-- Cloud backup of study progress: one row per user holding the app's backup JSON.
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

create policy "Users read their own progress"
  on public.user_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert their own progress"
  on public.user_progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own progress"
  on public.user_progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- In-app account deletion (App Store guideline 5.1.1(v)).
-- Deleting the auth user cascades to user_progress.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
