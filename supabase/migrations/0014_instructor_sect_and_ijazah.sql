-- Two discovery attributes a tutor declares about their own teaching, both on instructor_profiles
-- because they describe the teaching profile rather than the person: a learner filtering for them
-- is filtering the published tutor listing, and that listing is already readable under the existing
-- published/approved policy, so no join and no policy change is needed to filter on them.
--
-- Additive only: two nullable/defaulted columns and two partial indexes. Nothing is dropped,
-- rewritten or backfilled, and every existing row stays valid.

alter table public.instructor_profiles add column if not exists sect text;
alter table public.instructor_profiles add column if not exists has_ijazah boolean not null default false;

-- Sect is a short declared value, not free prose. The list stays open enough to cover the schools a
-- tutor may teach within, and null means simply "not stated".
do $$
begin
  alter table public.instructor_profiles
    add constraint instructor_profiles_sect_check
    check (sect is null or sect in ('Sunni', 'Shia', 'Other', 'Prefer not to say'));
exception
  when duplicate_object then null;
end
$$;

-- Discovery filters on these, so both get an index scoped to the rows that can actually match.
create index if not exists instructor_profiles_sect_idx
  on public.instructor_profiles (sect) where sect is not null;
create index if not exists instructor_profiles_ijazah_idx
  on public.instructor_profiles (has_ijazah) where has_ijazah;

comment on column public.instructor_profiles.sect is
  'Self-declared school the tutor teaches within. Null means not stated.';
comment on column public.instructor_profiles.has_ijazah is
  'Tutor declares holding an ijazah. Declared, not verified — verification_status is the reviewed signal.';
