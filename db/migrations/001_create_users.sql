create table if not exists users (
  id uuid primary key,
  email text not null,
  password_hash text not null,
  full_name text,
  role text not null default 'user',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint users_role_check check (role in ('user', 'admin')),
  constraint users_status_check check (status in ('active', 'disabled'))
);

create unique index if not exists users_email_lower_idx on users (lower(email));
create index if not exists users_status_idx on users (status);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists users_set_updated_at on users;

create trigger users_set_updated_at
before update on users
for each row
execute function set_updated_at();
