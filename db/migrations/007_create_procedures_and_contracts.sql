create table if not exists procedures (
  id bigint generated always as identity primary key,
  source text not null default 'tenderland',
  external_id text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procedures_source_not_blank_check check (btrim(source) <> ''),
  constraint procedures_external_id_not_blank_check check (
    external_id is null or btrim(external_id) <> ''
  ),
  constraint procedures_source_payload_object_check check (
    jsonb_typeof(source_payload) = 'object'
  ),
  constraint procedures_source_external_id_unique unique (source, external_id)
);

create table if not exists contracts (
  id bigint generated always as identity primary key,
  procedure_id bigint references procedures(id) on delete set null,
  source text not null default 'tenderland',
  external_id text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_source_not_blank_check check (btrim(source) <> ''),
  constraint contracts_external_id_not_blank_check check (
    external_id is null or btrim(external_id) <> ''
  ),
  constraint contracts_source_payload_object_check check (
    jsonb_typeof(source_payload) = 'object'
  ),
  constraint contracts_source_external_id_unique unique (source, external_id)
);

create index if not exists contracts_procedure_id_idx on contracts (procedure_id);

drop trigger if exists procedures_set_updated_at on procedures;

create trigger procedures_set_updated_at
before update on procedures
for each row
execute function set_updated_at();

drop trigger if exists contracts_set_updated_at on contracts;

create trigger contracts_set_updated_at
before update on contracts
for each row
execute function set_updated_at();
