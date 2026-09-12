-- Certificates: the two columns the agreed rule needs, and nothing else.
--
-- The rule is: every published lesson in the course completed, and — where the course has quizzes or
-- graded assignments — the course's required pass mark met. A course with no assessment needs only
-- the lessons.
--
-- Two things were missing to express that, and both are added here.
--
-- 1. `courses.pass_mark` — the mark a course requires. It is deliberately NULLABLE with no default:
--    a pass mark must be a decision the instructor makes, not a number this migration invents. The
--    consequence is stated plainly rather than papered over — a course that HAS assessments but no
--    pass mark set issues nothing, and the learner is shown a setup-needed state naming what is
--    missing. Adding a default here would be inventing the rule.
--
-- 2. `certificates.verification_code` — what a verifier types or scans. It is not the primary key
--    and not sequential: `certificates.id` is a uuid that also identifies a learner's private
--    record, and a public surface should not accept it. The code is generated server-side from a
--    cryptographic random source, so the public lookup cannot be walked.
--
-- Both columns are nullable and additive. Every existing row stays valid, every existing query keeps
-- working, and no policy is created, altered or dropped — issuance still runs through the service
-- role after a server-side check, exactly as `certificates_admin_write` intends.

alter table public.courses
  add column if not exists pass_mark smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'courses_pass_mark_range') then
    alter table public.courses
      add constraint courses_pass_mark_range check (pass_mark is null or (pass_mark between 0 and 100));
  end if;
end $$;

comment on column public.courses.pass_mark is
  'Minimum average assessment score a learner must reach for a certificate, 0-100. NULL means the instructor has not set one, and a course with assessments but no pass mark issues no certificate.';

alter table public.certificates
  add column if not exists verification_code text;

-- Unique where present, so existing rows with no code do not collide with each other.
create unique index if not exists certificates_verification_code_key
  on public.certificates (verification_code)
  where verification_code is not null;

comment on column public.certificates.verification_code is
  'Public, cryptographically random lookup code. Never the row id: the id identifies a private record and must not be accepted on a public surface.';
