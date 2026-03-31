begin;

-- Harden public functions against mutable search_path by setting an explicit path.
do $$
declare
  function_names text[] := array[
    'set_notification_preferences_updated_at',
    'handle_new_user',
    'set_updated_at',
    'tfs_set_updated_at',
    'tfs_jsonb_object_keys_subset',
    'fa_current_role',
    'tfs_validate_store_visit_field_values',
    'get_users_with_profiles',
    'admin_exec_sql',
    'get_admin_user_id',
    'create_purchase_order_invoice',
    'fa_log_activity',
    'fa_next_incident_reference_no',
    'insert_invoice_as_admin',
    'fa_trigger_set_incident_reference_no',
    'update_updated_at_column',
    'fa_audit_trigger',
    'fa_is_admin',
    'fa_is_ops',
    'get_user_role',
    'is_admin',
    'get_provider_id',
    'fa_is_readonly',
    'fa_protect_profile_role',
    'fa_update_updated_at',
    'insert_mock_providers',
    'tfs_validate_store_visit_amount_checks',
    'create_mock_provider',
    'tfs_validate_store_visit_items_checked',
    'create_mock_provider_if_exists',
    'create_all_mock_providers',
    'fa_get_user_role',
    'fa_generate_incident_reference',
    'tfs_store_visit_activity_allowed_field_keys',
    'insert_mock_providers_dev',
    'tfs_validate_store_visit_activity_payload',
    'tfs_validate_store_visit_activity_payloads',
    'create_mock_provider_complete',
    'create_placeholder_user_for_provider',
    'setup_mock_providers'
  ];
  fn_signature regprocedure;
begin
  for fn_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(function_names)
  loop
    execute format(
      'alter function %s set search_path = public, pg_temp',
      fn_signature
    );
  end loop;
end
$$;

-- Replace permissive RLS policies that used USING/WITH CHECK (true).
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'fa_activity_log'
      and policyname = 'System can insert activity logs'
  ) then
    execute 'drop policy "System can insert activity logs" on public.fa_activity_log';
    execute $policy$
      create policy "System can insert activity logs"
      on public.fa_activity_log
      for insert
      to authenticated
      with check (auth.uid() is not null)
    $policy$;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sup_assignments'
      and policyname = 'Allow anonymous inserts for development'
  ) then
    execute 'drop policy "Allow anonymous inserts for development" on public.sup_assignments';
    execute $policy$
      create policy "Allow anonymous inserts for development"
      on public.sup_assignments
      for insert
      to authenticated
      with check (auth.uid() is not null)
    $policy$;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sup_assignments'
      and policyname = 'Allow authenticated inserts for development'
  ) then
    execute 'drop policy "Allow authenticated inserts for development" on public.sup_assignments';
    execute $policy$
      create policy "Allow authenticated inserts for development"
      on public.sup_assignments
      for insert
      to authenticated
      with check (auth.uid() is not null)
    $policy$;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sup_assignments'
      and policyname = 'Allow authenticated updates for development'
  ) then
    execute 'drop policy "Allow authenticated updates for development" on public.sup_assignments';
    execute $policy$
      create policy "Allow authenticated updates for development"
      on public.sup_assignments
      for update
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null)
    $policy$;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sup_assignments'
      and policyname = 'Allow updates for development when no auth'
  ) then
    execute 'drop policy "Allow updates for development when no auth" on public.sup_assignments';
    execute $policy$
      create policy "Allow updates for development when no auth"
      on public.sup_assignments
      for update
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null)
    $policy$;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sup_events'
      and policyname = 'Allow anonymous updates for development'
  ) then
    execute 'drop policy "Allow anonymous updates for development" on public.sup_events';
    execute $policy$
      create policy "Allow anonymous updates for development"
      on public.sup_events
      for update
      to authenticated
      using (auth.uid() is not null)
      with check (auth.uid() is not null)
    $policy$;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sup_notifications'
      and policyname = 'Allow notification inserts'
  ) then
    execute 'drop policy "Allow notification inserts" on public.sup_notifications';
    execute $policy$
      create policy "Allow notification inserts"
      on public.sup_notifications
      for insert
      to authenticated
      with check (auth.uid() is not null)
    $policy$;
  end if;
end
$$;

commit;
