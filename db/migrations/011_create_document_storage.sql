create table if not exists file_objects (
  id bigint generated always as identity primary key,
  storage_provider text not null default 'r2',
  bucket_name text not null,
  object_key text not null,
  status text not null default 'pending',
  original_name text not null,
  content_type text,
  size_bytes bigint,
  sha256 text,
  etag text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stored_at timestamptz,
  deleted_at timestamptz,
  constraint file_objects_provider_check check (storage_provider in ('r2')),
  constraint file_objects_bucket_not_blank_check check (btrim(bucket_name) <> ''),
  constraint file_objects_key_not_blank_check check (btrim(object_key) <> ''),
  constraint file_objects_name_not_blank_check check (btrim(original_name) <> ''),
  constraint file_objects_status_check check (
    status in ('pending', 'uploading', 'stored', 'failed', 'quarantined', 'deleted')
  ),
  constraint file_objects_size_check check (size_bytes is null or size_bytes >= 0),
  constraint file_objects_sha256_check check (
    sha256 is null or sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint file_objects_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint file_objects_storage_key_unique unique (storage_provider, bucket_name, object_key)
);

create index if not exists file_objects_status_created_idx
on file_objects (status, created_at);

create index if not exists file_objects_sha256_idx
on file_objects (sha256)
where sha256 is not null;

create table if not exists documents (
  id bigint generated always as identity primary key,
  deal_id bigint not null references deals(id) on delete restrict,
  file_object_id bigint references file_objects(id) on delete set null,
  source text not null default 'manual',
  external_id text,
  external_storage_id bigint,
  family_key text not null,
  name text not null,
  content_type text,
  size_bytes bigint,
  group_id text,
  group_name text,
  version text,
  published_at timestamptz,
  source_url text,
  status text not null default 'metadata_only',
  is_current boolean not null default true,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documents_source_check check (
    source in ('tenderland', 'manual', 'generated', 'email')
  ),
  constraint documents_family_not_blank_check check (btrim(family_key) <> ''),
  constraint documents_name_not_blank_check check (btrim(name) <> ''),
  constraint documents_external_id_not_blank_check check (
    external_id is null or btrim(external_id) <> ''
  ),
  constraint documents_external_storage_id_check check (
    external_storage_id is null or external_storage_id > 0
  ),
  constraint documents_size_check check (size_bytes is null or size_bytes >= 0),
  constraint documents_status_check check (
    status in (
      'metadata_only', 'pending_upload', 'queued', 'downloading', 'stored',
      'external_only', 'failed', 'quarantined', 'deleted'
    )
  ),
  constraint documents_source_url_check check (
    source_url is null
    or (
      source_url ~* '^https?://'
      and source_url !~* '([?&])apikey='
    )
  ),
  constraint documents_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists documents_source_external_unique_idx
on documents (deal_id, source, external_id)
where external_id is not null;

create unique index if not exists documents_source_storage_unique_idx
on documents (deal_id, source, external_storage_id)
where external_storage_id is not null;

create index if not exists documents_deal_current_idx
on documents (deal_id, is_current, published_at desc, id desc)
where deleted_at is null;

create index if not exists documents_deal_family_idx
on documents (deal_id, family_key, version, id);

create index if not exists documents_status_idx
on documents (status, updated_at)
where deleted_at is null;

create table if not exists document_ingestion_jobs (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete cascade,
  job_type text not null default 'download_tenderland',
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint document_jobs_type_check check (job_type in ('download_tenderland')),
  constraint document_jobs_status_check check (
    status in ('pending', 'running', 'completed', 'failed')
  ),
  constraint document_jobs_attempts_check check (attempts >= 0 and max_attempts > 0),
  constraint document_jobs_document_type_unique unique (document_id, job_type)
);

create index if not exists document_jobs_ready_idx
on document_ingestion_jobs (scheduled_at, id)
where status = 'pending';

create table if not exists document_events (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete restrict,
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_events_type_not_blank_check check (btrim(event_type) <> ''),
  constraint document_events_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists document_events_document_created_idx
on document_events (document_id, created_at desc);

drop trigger if exists file_objects_set_updated_at on file_objects;
create trigger file_objects_set_updated_at
before update on file_objects
for each row execute function set_updated_at();

drop trigger if exists documents_set_updated_at on documents;
create trigger documents_set_updated_at
before update on documents
for each row execute function set_updated_at();

drop trigger if exists document_jobs_set_updated_at on document_ingestion_jobs;
create trigger document_jobs_set_updated_at
before update on document_ingestion_jobs
for each row execute function set_updated_at();

-- Older Tenderland exports may contain the API key inside nested URLs. Keep the
-- source payload, but remove query-string secrets before the file module exposes it.
create or replace function redact_tenderland_json_secrets(value jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  kind text;
  item record;
  result jsonb;
  plain_value text;
begin
  if value is null then return value; end if;
  kind := jsonb_typeof(value);

  if kind = 'object' then
    result := '{}'::jsonb;
    for item in select key, val from jsonb_each(value) as entry(key, val) loop
      if item.key ~* 'api.?key|secret|token' then
        result := result || jsonb_build_object(item.key, '[redacted]');
      else
        result := result || jsonb_build_object(item.key, redact_tenderland_json_secrets(item.val));
      end if;
    end loop;
    return result;
  end if;

  if kind = 'array' then
    select coalesce(jsonb_agg(redact_tenderland_json_secrets(element)), '[]'::jsonb)
      into result
      from jsonb_array_elements(value) as elements(element);
    return result;
  end if;

  if kind = 'string' then
    plain_value := value #>> '{}';
    plain_value := regexp_replace(
      plain_value,
      '([?&]apikey=)[^&[:space:]"'']*',
      '\1[redacted]',
      'gi'
    );
    return to_jsonb(plain_value);
  end if;

  return value;
end;
$$;

update deals
set source_payload = redact_tenderland_json_secrets(source_payload)
where source = 'tenderland'
  and source_payload::text ~* 'apikey|tenderland-api-key';

drop function redact_tenderland_json_secrets(jsonb);
