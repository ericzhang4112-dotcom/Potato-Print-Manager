create table if not exists public.user_print_manager_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_print_manager_data enable row level security;

drop policy if exists "Users can read their own print manager data" on public.user_print_manager_data;
create policy "Users can read their own print manager data"
on public.user_print_manager_data
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own print manager data" on public.user_print_manager_data;
create policy "Users can insert their own print manager data"
on public.user_print_manager_data
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own print manager data" on public.user_print_manager_data;
create policy "Users can update their own print manager data"
on public.user_print_manager_data
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_print_manager_data_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_print_manager_data_updated_at on public.user_print_manager_data;
create trigger set_print_manager_data_updated_at
before update on public.user_print_manager_data
for each row execute function public.set_print_manager_data_updated_at();

-- Remove legacy profile-image data that was previously stored in Auth metadata.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'avatar_data' - 'avatar_url'
where raw_user_meta_data ? 'avatar_data' or raw_user_meta_data ? 'avatar_url';

insert into storage.buckets (id, name, public)
values ('profile-pictures', 'profile-pictures', true)
on conflict (id) do update set public = true;

drop policy if exists "Users can upload their own profile picture" on storage.objects;
create policy "Users can upload their own profile picture"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Users can update their own profile picture" on storage.objects;
create policy "Users can update their own profile picture"
on storage.objects
for update
to authenticated
using (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Users can delete their own profile picture" on storage.objects;
create policy "Users can delete their own profile picture"
on storage.objects
for delete
to authenticated
using (bucket_id = 'profile-pictures' and (storage.foldername(name))[1] = (select auth.uid()::text));
