begin;

create table if not exists public.tfs_inbound_emails (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'outlook',
  outlook_message_id text not null,
  internet_message_id text null,
  conversation_id text null,
  mailbox_name text null,
  folder_name text null,
  subject text null,
  sender_name text null,
  sender_email text null,
  received_at timestamptz null,
  has_attachments boolean not null default false,
  body_preview text null,
  body_text text null,
  body_html text null,
  raw_payload jsonb not null default '{}'::jsonb,
  matched_store_id uuid null references public.tfs_stores(id) on delete set null,
  processing_status text not null default 'pending',
  last_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tfs_inbound_emails_source_check check (
    source in ('outlook')
  ),
  constraint tfs_inbound_emails_processing_status_check check (
    processing_status in ('pending', 'reviewed', 'ignored', 'error')
  ),
  constraint tfs_inbound_emails_raw_payload_object_check check (
    jsonb_typeof(raw_payload) = 'object'
  )
);

comment on table public.tfs_inbound_emails is
  'Raw inbound Outlook emails captured for later review, store matching, and parsing.';

comment on column public.tfs_inbound_emails.raw_payload is
  'Full Make.com / Outlook payload preserved as the source-of-truth email record.';

create unique index if not exists tfs_inbound_emails_outlook_message_id_idx
  on public.tfs_inbound_emails (outlook_message_id);

create index if not exists tfs_inbound_emails_processing_status_received_at_idx
  on public.tfs_inbound_emails (processing_status, received_at desc);

create index if not exists tfs_inbound_emails_matched_store_received_at_idx
  on public.tfs_inbound_emails (matched_store_id, received_at desc);

drop trigger if exists set_tfs_inbound_emails_updated_at on public.tfs_inbound_emails;
create trigger set_tfs_inbound_emails_updated_at
before update on public.tfs_inbound_emails
for each row
execute function public.tfs_set_updated_at();

grant select, insert, update, delete on public.tfs_inbound_emails to authenticated;
grant all on public.tfs_inbound_emails to service_role;

alter table public.tfs_inbound_emails enable row level security;

drop policy if exists tfs_inbound_emails_select_authenticated on public.tfs_inbound_emails;
create policy tfs_inbound_emails_select_authenticated
on public.tfs_inbound_emails
for select
to authenticated
using (auth.uid() is not null);

drop policy if exists tfs_inbound_emails_insert_admin_ops on public.tfs_inbound_emails;
create policy tfs_inbound_emails_insert_admin_ops
on public.tfs_inbound_emails
for insert
to authenticated
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_inbound_emails_update_admin_ops on public.tfs_inbound_emails;
create policy tfs_inbound_emails_update_admin_ops
on public.tfs_inbound_emails
for update
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'))
with check (public.tfs_current_user_role() in ('admin', 'ops'));

drop policy if exists tfs_inbound_emails_delete_admin_ops on public.tfs_inbound_emails;
create policy tfs_inbound_emails_delete_admin_ops
on public.tfs_inbound_emails
for delete
to authenticated
using (public.tfs_current_user_role() in ('admin', 'ops'));

commit;
