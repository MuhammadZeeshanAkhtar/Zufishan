-- A published requirement is readable by signed-in instructors.
--
-- Until now the only read policy on this table was:
--   learner_requirements_own_or_moderator
--     for select using (learner_id = auth.uid() or is_moderator_user())
--
-- Nothing granted read access to a *published* requirement, so the marketplace was not empty — it
-- was invisible. Verified directly: with one published row present, the service role saw 1, its
-- author saw 1, an anonymous visitor saw 0, and a signed-in instructor saw 0. The instructor desk,
-- the public listing, the requirement detail page and the "respond" form therefore returned nothing
-- to anyone, and `createRequirementResponse` could never find the requirement it was answering, so
-- no instructor could respond to anything at all.
--
-- This is the narrower of the two ways to fix it, chosen deliberately:
--
--   * A learner's requirement names their goal, timezone, availability and budget. Publishing means
--     "instructors may approach me", not "put this on the open internet", so anonymous visitors are
--     still shown nothing and the public /requirements page stays a sign-in prompt.
--   * Drafts remain author-only. Publishing stays the learner's explicit act, and un-publishing
--     takes the row back out of view immediately, because this policy reads `status` live.
--
-- Additive: this is a second permissive SELECT policy, so it can only widen reads for the specific
-- case it names. The existing policy is untouched, and every write policy is untouched — an
-- instructor still cannot insert, update or delete a learner's requirement.

drop policy if exists learner_requirements_published_to_instructors on public.learner_requirements;
create policy learner_requirements_published_to_instructors
  on public.learner_requirements
  for select
  using (status = 'published' and public.is_user_role('instructor'));

comment on policy learner_requirements_published_to_instructors on public.learner_requirements is
  'Lets a signed-in instructor read requirements a learner has published. Drafts stay author-only, and anonymous visitors read nothing.';
