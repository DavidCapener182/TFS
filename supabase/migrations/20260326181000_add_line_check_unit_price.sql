begin;

create or replace function public.tfs_validate_store_visit_items_checked(p_items jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
begin
  if p_items is null then
    return true;
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) <> 'object' then
      return false;
    end if;

    if not public.tfs_jsonb_object_keys_subset(
      item,
      array['productId', 'productLabel', 'variantLabel', 'sizeLabel', 'unitPrice', 'systemQuantity', 'countedQuantity', 'notes']
    ) then
      return false;
    end if;

    if item ? 'productId' and jsonb_typeof(item -> 'productId') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'productLabel' and jsonb_typeof(item -> 'productLabel') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'variantLabel' and jsonb_typeof(item -> 'variantLabel') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'sizeLabel' and jsonb_typeof(item -> 'sizeLabel') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'unitPrice' and jsonb_typeof(item -> 'unitPrice') not in ('number', 'null') then
      return false;
    end if;

    if item ? 'notes' and jsonb_typeof(item -> 'notes') not in ('string', 'null') then
      return false;
    end if;

    if item ? 'systemQuantity' and jsonb_typeof(item -> 'systemQuantity') not in ('number', 'null') then
      return false;
    end if;

    if item ? 'countedQuantity' and jsonb_typeof(item -> 'countedQuantity') not in ('number', 'null') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on column public.tfs_store_visits.completed_activity_payloads is
  'Structured visit activity data keyed by completed visit activity, including task-specific fields, line counts with price, and cash checks.';

commit;
