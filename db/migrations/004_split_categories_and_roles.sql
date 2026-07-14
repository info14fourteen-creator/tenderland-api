alter table users
add column if not exists category text,
add column if not exists business_role text;

update users
set category = case
  when lower(email) = 'admin@kortex.capital' then 'super_admin'
  when role = 'admin' then 'admin'
  else 'user'
end
where category is null;

update users
set business_role = 'Менеджер'
where business_role is null;

alter table users
alter column category set default 'user',
alter column category set not null,
alter column business_role set default 'Менеджер',
alter column business_role set not null;

alter table users
drop constraint if exists users_category_check;

alter table users
add constraint users_category_check
check (category in ('user', 'admin', 'super_admin'));

alter table users
drop constraint if exists users_business_role_check;

alter table users
add constraint users_business_role_check
check (business_role in (
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
));

alter table invitations
add column if not exists category text,
add column if not exists business_role text;

update invitations
set category = case
  when role = 'admin' then 'admin'
  else 'user'
end
where category is null;

update invitations
set business_role = 'Менеджер'
where business_role is null;

alter table invitations
alter column category set default 'user',
alter column category set not null,
alter column business_role set default 'Менеджер',
alter column business_role set not null;

alter table invitations
drop constraint if exists invitations_category_check;

alter table invitations
add constraint invitations_category_check
check (category in ('user', 'admin', 'super_admin'));

alter table invitations
drop constraint if exists invitations_business_role_check;

alter table invitations
add constraint invitations_business_role_check
check (business_role in (
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
));
