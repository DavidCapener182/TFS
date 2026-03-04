-- Product feedback & release notes system
-- Tables: release_notes, user_release_views, user_feedback

-- Release Notes
create table if not exists release_notes (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  title text,
  description text,
  content text,
  created_at timestamptz default now(),
  is_active boolean default true
);

alter table release_notes enable row level security;

create policy "Anyone authenticated can read active releases"
  on release_notes for select
  to authenticated
  using (true);

create policy "Admins can insert releases"
  on release_notes for insert
  to authenticated
  with check (
    exists (
      select 1 from fa_profiles
      where fa_profiles.id = auth.uid()
      and fa_profiles.role = 'admin'
    )
  );

create policy "Admins can update releases"
  on release_notes for update
  to authenticated
  using (
    exists (
      select 1 from fa_profiles
      where fa_profiles.id = auth.uid()
      and fa_profiles.role = 'admin'
    )
  );

create policy "Admins can delete releases"
  on release_notes for delete
  to authenticated
  using (
    exists (
      select 1 from fa_profiles
      where fa_profiles.id = auth.uid()
      and fa_profiles.role = 'admin'
    )
  );

-- User Release Views (tracks which releases a user has dismissed)
create table if not exists user_release_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  release_id uuid references release_notes(id) on delete cascade,
  viewed_at timestamptz default now(),
  unique (user_id, release_id)
);

alter table user_release_views enable row level security;

create policy "Users can read own views"
  on user_release_views for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own views"
  on user_release_views for insert
  to authenticated
  with check (user_id = auth.uid());

-- User Feedback (bugs, feature requests, general feedback)
create table if not exists user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  type text not null check (type in ('bug', 'feature', 'feedback')),
  title text not null,
  description text,
  page_url text,
  browser_info text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  admin_notes text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

alter table user_feedback enable row level security;

create policy "Users can insert own feedback"
  on user_feedback for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can read own feedback"
  on user_feedback for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from fa_profiles
      where fa_profiles.id = auth.uid()
      and fa_profiles.role = 'admin'
    )
  );

create policy "Admins can update feedback"
  on user_feedback for update
  to authenticated
  using (
    exists (
      select 1 from fa_profiles
      where fa_profiles.id = auth.uid()
      and fa_profiles.role = 'admin'
    )
  );

create policy "Admins can delete feedback"
  on user_feedback for delete
  to authenticated
  using (
    exists (
      select 1 from fa_profiles
      where fa_profiles.id = auth.uid()
      and fa_profiles.role = 'admin'
    )
  );
