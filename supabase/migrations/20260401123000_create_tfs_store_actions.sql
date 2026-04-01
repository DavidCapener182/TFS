begin;

create table if not exists public.tfs_store_actions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.tfs_stores(id) on delete cascade,
  title text not null,
  description text null,
  source_flagged_item text null,
  priority_summary text null,
  priority text not null default 'medium',
  due_date date not null,
  status text not null default 'open',
  ai_generated boolean not null default false,
  created_by_user_id uuid null,
  completed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_store_actions_title_not_blank check (btrim(title) <> ''),
  constraint tfs_store_actions_priority_check check (
    priority in ('low', 'medium', 'high', 'urgent')
  ),
  constraint tfs_store_actions_status_check check (
    status in ('open', 'in_progress', 'blocked', 'complete', 'cancelled')
  )
);

comment on table public.tfs_store_actions is
  'Direct store follow-up actions owned by the TFS CRM stack.';

comment on column public.tfs_store_actions.priority_summary is
  'Optional derived priority rationale copied from the action title classifier.';

create index if not exists tfs_store_actions_store_status_due_idx
  on public.tfs_store_actions (store_id, status, due_date);

create index if not exists tfs_store_actions_due_date_idx
  on public.tfs_store_actions (due_date);

create index if not exists tfs_store_actions_created_by_idx
  on public.tfs_store_actions (created_by_user_id);

drop trigger if exists set_tfs_store_actions_updated_at on public.tfs_store_actions;
create trigger set_tfs_store_actions_updated_at
before update on public.tfs_store_actions
for each row
execute function public.tfs_set_updated_at();

grant select, insert, update, delete on public.tfs_store_actions to authenticated;
grant all on public.tfs_store_actions to service_role;

alter table public.tfs_store_actions enable row level security;

drop policy if exists tfs_store_actions_select_authenticated on public.tfs_store_actions;
create policy tfs_store_actions_select_authenticated
on public.tfs_store_actions
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_store_actions_insert_admin_ops on public.tfs_store_actions;
create policy tfs_store_actions_insert_admin_ops
on public.tfs_store_actions
for insert
to authenticated
with check (
  public.tfs_current_user_role() in ('admin', 'ops')
  and (created_by_user_id is null or created_by_user_id = auth.uid())
);

drop policy if exists tfs_store_actions_update_admin_ops on public.tfs_store_actions;
create policy tfs_store_actions_update_admin_ops
on public.tfs_store_actions
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_store_actions_delete_admin_ops on public.tfs_store_actions;
create policy tfs_store_actions_delete_admin_ops
on public.tfs_store_actions
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

commit;
