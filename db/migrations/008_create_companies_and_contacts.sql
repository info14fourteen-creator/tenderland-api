create table if not exists companies (
  id bigint generated always as identity primary key,
  source text not null default 'manual',
  external_id text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_source_not_blank_check check (btrim(source) <> ''),
  constraint companies_external_id_not_blank_check check (
    external_id is null or btrim(external_id) <> ''
  ),
  constraint companies_source_payload_object_check check (
    jsonb_typeof(source_payload) = 'object'
  ),
  constraint companies_source_external_id_unique unique (source, external_id)
);

create table if not exists contacts (
  id bigint generated always as identity primary key,
  source text not null default 'manual',
  external_id text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_source_not_blank_check check (btrim(source) <> ''),
  constraint contacts_external_id_not_blank_check check (
    external_id is null or btrim(external_id) <> ''
  ),
  constraint contacts_source_payload_object_check check (
    jsonb_typeof(source_payload) = 'object'
  ),
  constraint contacts_source_external_id_unique unique (source, external_id)
);

create table if not exists company_contacts (
  company_id bigint not null references companies(id) on delete cascade,
  contact_id bigint not null references contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (company_id, contact_id)
);

create index if not exists company_contacts_contact_id_idx
on company_contacts (contact_id);

drop trigger if exists companies_set_updated_at on companies;

create trigger companies_set_updated_at
before update on companies
for each row
execute function set_updated_at();

drop trigger if exists contacts_set_updated_at on contacts;

create trigger contacts_set_updated_at
before update on contacts
for each row
execute function set_updated_at();
