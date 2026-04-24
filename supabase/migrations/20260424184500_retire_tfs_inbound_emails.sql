begin;

do $$
begin
  if to_regclass('public.tfs_inbound_emails') is not null then
    drop policy if exists tfs_inbound_emails_select_authenticated on public.tfs_inbound_emails;
    drop policy if exists tfs_inbound_emails_insert_admin_ops on public.tfs_inbound_emails;
    drop policy if exists tfs_inbound_emails_update_admin_ops on public.tfs_inbound_emails;
    drop policy if exists tfs_inbound_emails_delete_admin_ops on public.tfs_inbound_emails;

    revoke all on public.tfs_inbound_emails from authenticated;
    revoke all on public.tfs_inbound_emails from anon;
    grant all on public.tfs_inbound_emails to service_role;
  end if;
end $$;

commit;
