begin;

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'alter table public.profiles enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
    ) then
      execute $policy$
        create policy "profiles_select_own"
        on public.profiles
        for select
        to authenticated
        using (id = auth.uid())
      $policy$;

      execute $policy$
        create policy "profiles_insert_own"
        on public.profiles
        for insert
        to authenticated
        with check (id = auth.uid())
      $policy$;

      execute $policy$
        create policy "profiles_update_own"
        on public.profiles
        for update
        to authenticated
        using (id = auth.uid())
        with check (id = auth.uid())
      $policy$;
    end if;
  end if;

  if to_regclass('public.tfs_activity_log') is not null then
    execute 'alter table public.tfs_activity_log enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'tfs_activity_log'
    ) then
      execute $policy$
        create policy "tfs_activity_log_select_authenticated"
        on public.tfs_activity_log
        for select
        to authenticated
        using (auth.uid() is not null)
      $policy$;

      execute $policy$
        create policy "tfs_activity_log_insert_self"
        on public.tfs_activity_log
        for insert
        to authenticated
        with check (
          auth.uid() is not null
          and performed_by_user_id = auth.uid()
        )
      $policy$;
    end if;
  end if;
end
$$;

commit;
