alter table users
add column if not exists business_roles text[];

update users
set business_roles = array[
  'Менеджер',
  'Специалист по работе с государственным сегментом',
  'Специалист юридической службы',
  'Финансовый контроллер',
  'Бухгалтер',
  'Специалист службы безопасности',
  'Специалист отдела закупок',
  'Специалист отдела продаж',
  'Специалист отдела делопроизводства',
  'Специалист отдела логистики'
]::text[]
where business_roles is null;

alter table users
alter column business_roles set default array[
  'Менеджер',
  'Специалист по работе с государственным сегментом',
  'Специалист юридической службы',
  'Финансовый контроллер',
  'Бухгалтер',
  'Специалист службы безопасности',
  'Специалист отдела закупок',
  'Специалист отдела продаж',
  'Специалист отдела делопроизводства',
  'Специалист отдела логистики'
]::text[],
alter column business_roles set not null;

alter table users
drop constraint if exists users_business_roles_check;

alter table users
add constraint users_business_roles_check
check (
  cardinality(business_roles) > 0
  and business_roles <@ array[
    'Менеджер',
    'Специалист по работе с государственным сегментом',
    'Специалист юридической службы',
    'Финансовый контроллер',
    'Бухгалтер',
    'Специалист службы безопасности',
    'Специалист отдела закупок',
    'Специалист отдела продаж',
    'Специалист отдела делопроизводства',
    'Специалист отдела логистики'
  ]::text[]
);

alter table invitations
add column if not exists business_roles text[];

update invitations
set business_roles = array[business_role]::text[]
where business_roles is null;

alter table invitations
alter column business_roles set default array[
  'Менеджер',
  'Специалист по работе с государственным сегментом',
  'Специалист юридической службы',
  'Финансовый контроллер',
  'Бухгалтер',
  'Специалист службы безопасности',
  'Специалист отдела закупок',
  'Специалист отдела продаж',
  'Специалист отдела делопроизводства',
  'Специалист отдела логистики'
]::text[],
alter column business_roles set not null;

alter table invitations
drop constraint if exists invitations_business_roles_check;

alter table invitations
add constraint invitations_business_roles_check
check (
  cardinality(business_roles) > 0
  and business_roles <@ array[
    'Менеджер',
    'Специалист по работе с государственным сегментом',
    'Специалист юридической службы',
    'Финансовый контроллер',
    'Бухгалтер',
    'Специалист службы безопасности',
    'Специалист отдела закупок',
    'Специалист отдела продаж',
    'Специалист отдела делопроизводства',
    'Специалист отдела логистики'
  ]::text[]
);
