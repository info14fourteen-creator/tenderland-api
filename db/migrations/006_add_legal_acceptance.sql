alter table users
add column if not exists terms_accepted_at timestamptz,
add column if not exists terms_version text,
add column if not exists privacy_version text;

alter table users
drop constraint if exists users_legal_acceptance_check;

alter table users
add constraint users_legal_acceptance_check
check (
  (terms_accepted_at is null and terms_version is null and privacy_version is null)
  or
  (terms_accepted_at is not null and terms_version is not null and privacy_version is not null)
);
