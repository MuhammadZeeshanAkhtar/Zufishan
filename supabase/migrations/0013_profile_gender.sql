-- Gender lives on `profiles` because it is shared user data: one column serves learners and tutors
-- alike, so a person who is both never carries two values. No lookup table — the vocabulary is two
-- fixed values, and a table would add a join without adding meaning.
--
-- Additive only: one nullable column, one constraint, one partial index. Nothing is dropped,
-- rewritten, or backfilled, and every existing row stays valid with gender left null.

alter table public.profiles add column if not exists gender text;

-- Named constraint so re-running the migration is a no-op rather than an error.
do $$
begin
  alter table public.profiles
    add constraint profiles_gender_check
    check (gender is null or gender in ('male', 'female'));
exception
  when duplicate_object then null;
end
$$;

-- Find a Tutor filters on this column through the published-instructor set; the partial index keeps
-- that lookup cheap without indexing the rows that have not chosen a value.
create index if not exists profiles_gender_idx on public.profiles (gender) where gender is not null;

comment on column public.profiles.gender is
  'Self-declared gender, used for tutor discovery filtering. Null means not provided.';
