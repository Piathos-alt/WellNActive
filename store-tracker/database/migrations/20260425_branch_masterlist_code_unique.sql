-- Purpose: enforce unique store codes in branch_masterlist for safer upsert/update handling.
-- Run this in Supabase SQL editor or your migration runner.

-- 1) Pre-check: identify duplicates that must be fixed before adding unique constraint.
select code, count(*) as duplicate_count
from public.branch_masterlist
group by code
having count(*) > 1;

-- 2) Add unique constraint only when duplicate data does not exist.
do $$
begin
  if exists (
    select 1
    from public.branch_masterlist
    group by code
    having count(*) > 1
  ) then
    raise exception 'Cannot add unique constraint: duplicate code values exist in public.branch_masterlist';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'branch_masterlist_code_key'
      and conrelid = 'public.branch_masterlist'::regclass
  ) then
    alter table public.branch_masterlist
      add constraint branch_masterlist_code_key unique (code);
  end if;
end
$$;

-- 3) Optional verification.
select conname
from pg_constraint
where conname = 'branch_masterlist_code_key'
  and conrelid = 'public.branch_masterlist'::regclass;
