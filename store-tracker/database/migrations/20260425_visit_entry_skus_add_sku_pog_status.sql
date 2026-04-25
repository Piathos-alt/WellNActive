-- Purpose: add per-SKU POG status so each SKU can be marked independently.
-- Run this in Supabase SQL editor or your migration runner.

-- 1) Add the new column.
alter table public.visit_entry_skus
  add column if not exists sku_pog_status text;

-- 2) Backfill existing rows from the visit-level POG value when available.
update public.visit_entry_skus as sku
set sku_pog_status = coalesce(nullif(trim(entry.pog_status), ''), 'Non-POG')
from public.visit_entries as entry
where entry.id = sku.visit_entry_id
  and (sku.sku_pog_status is null or trim(sku.sku_pog_status) = '');

-- 3) Ensure future inserts have a valid default.
alter table public.visit_entry_skus
  alter column sku_pog_status set default 'Non-POG';

-- 4) Lock values to the expected options.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'visit_entry_skus_sku_pog_status_check'
      and conrelid = 'public.visit_entry_skus'::regclass
  ) then
    alter table public.visit_entry_skus
      add constraint visit_entry_skus_sku_pog_status_check
      check (sku_pog_status in ('POG', 'Non-POG'));
  end if;
end
$$;

-- 5) Make the column required after backfill.
alter table public.visit_entry_skus
  alter column sku_pog_status set not null;

-- 6) Optional verification.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'visit_entry_skus'
  and column_name = 'sku_pog_status';
