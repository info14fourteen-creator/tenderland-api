create table if not exists invitations (
  id uuid primary key,
  email text,
  code text not null unique,
  role text not null default 'user',
  status text not null default 'active',
  created_by uuid references users(id) on delete set null,
  used_by uuid references users(id) on delete set null,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_role_check check (role in ('user', 'admin')),
  constraint invitations_status_check check (status in ('active', 'revoked'))
);

create index if not exists invitations_email_lower_idx on invitations (lower(email));
create index if not exists invitations_code_idx on invitations (code);
create index if not exists invitations_status_idx on invitations (status);
