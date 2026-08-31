-- Noor Ilm scheduling hardening: additive availability controls only.
-- No tables are dropped and no user or scheduling rows are deleted.
alter table public.instructor_availability
  add column if not exists buffer_minutes integer not null default 0,
  add column if not exists minimum_notice_minutes integer not null default 60;

alter table public.instructor_availability
  drop constraint if exists instructor_availability_buffer_minutes_check;
alter table public.instructor_availability
  add constraint instructor_availability_buffer_minutes_check
  check (buffer_minutes between 0 and 1440);

alter table public.instructor_availability
  drop constraint if exists instructor_availability_minimum_notice_check;
alter table public.instructor_availability
  add constraint instructor_availability_minimum_notice_check
  check (minimum_notice_minutes between 0 and 10080);

comment on column public.instructor_availability.buffer_minutes is 'Minimum gap after a scheduled interval, in minutes.';
comment on column public.instructor_availability.minimum_notice_minutes is 'Minimum lead time before a slot can be requested, in minutes.';
