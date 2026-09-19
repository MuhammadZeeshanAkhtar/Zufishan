-- A teacher's stated background: where they have taught, what they hold, and any ijazah.
--
-- `instructor_credentials` already exists, but it is a *file* table — object_path, mime_type,
-- size_bytes, review_status — for documents an admin reviews privately. What a teacher writes on
-- their profile for a learner to read is a different thing: several short, ordered, repeatable
-- entries, each of which is public once the profile is published. Putting prose into the file table
-- would have meant nullable paths and a row that is sometimes a document and sometimes a sentence.
--
-- Additive only: one new table, its policies, and one nullable column. Nothing existing is dropped,
-- rewritten, backfilled or relaxed, and every existing row stays valid.

create table if not exists public.instructor_qualifications (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructor_profiles(user_id) on delete cascade,
  -- Which of the three lists on the profile editor this entry belongs to.
  kind text not null check (kind in ('employment', 'certification', 'ijazah')),
  title text not null check (length(btrim(title)) between 1 and 160),
  organisation text check (organisation is null or length(organisation) <= 160),
  -- Free text rather than dates: a teacher writes "2014 – 2019" or "since 1441 AH", and forcing
  -- that into a date range would either lose the meaning or reject the entry.
  period text check (period is null or length(period) <= 80),
  detail text check (detail is null or length(detail) <= 600),
  -- The order the teacher arranged them in; ties fall back to when the row was written.
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instructor_qualifications_owner_idx
  on public.instructor_qualifications (instructor_id, kind, position);

alter table public.instructor_qualifications enable row level security;

-- A teacher owns their own entries outright.
do $$
begin
  create policy instructor_qualifications_own_or_admin
    on public.instructor_qualifications for all
    using (instructor_id = auth.uid() or public.is_admin_user())
    with check (instructor_id = auth.uid() or public.is_admin_user());
exception
  when duplicate_object then null;
end $$;

-- And anyone may read the entries of a teacher whose profile is already published and approved —
-- exactly the rows the public listing itself is allowed to return, so this exposes nothing that the
-- profile page does not already show.
do $$
begin
  create policy instructor_qualifications_public_read
    on public.instructor_qualifications for select
    using (exists (
      select 1 from public.instructor_profiles p
      where p.user_id = instructor_qualifications.instructor_id
        and p.public_profile_status = 'published'
        and p.verification_status = 'approved'
    ));
exception
  when duplicate_object then null;
end $$;

comment on table public.instructor_qualifications is
  'Teacher-written employment history, certifications and ijazah entries shown on the public profile. Documents for private review stay in instructor_credentials.';

-- The school of fiqh a teacher teaches within, kept separate from `sect`: the reference listing
-- asks for both, and a learner filtering for one is not filtering for the other. Null means simply
-- "not stated", as with sect.
alter table public.instructor_profiles add column if not exists fiqh text;

do $$
begin
  alter table public.instructor_profiles
    add constraint instructor_profiles_fiqh_check
    check (fiqh is null or fiqh in ('Hanafi', 'Shafii', 'Maliki', 'Hanbali', 'Other', 'Prefer not to say'));
exception
  when duplicate_object then null;
end $$;

comment on column public.instructor_profiles.fiqh is
  'Declared school of fiqh. Separate from sect; null means not stated.';
