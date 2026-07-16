create table if not exists deal_stages (
  id bigint generated always as identity primary key,
  deal_type text not null,
  code text not null,
  name text not null,
  stage_group text not null default 'neutral',
  sort_order integer not null,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_stages_deal_type_check check (
    deal_type in ('procedure', 'expense', 'execution')
  ),
  constraint deal_stages_code_not_blank_check check (btrim(code) <> ''),
  constraint deal_stages_name_not_blank_check check (btrim(name) <> ''),
  constraint deal_stages_group_check check (
    stage_group in ('neutral', 'success', 'failure')
  ),
  constraint deal_stages_sort_order_check check (sort_order > 0),
  constraint deal_stages_type_code_unique unique (deal_type, code),
  constraint deal_stages_type_name_unique unique (deal_type, name),
  constraint deal_stages_type_order_unique unique (deal_type, sort_order)
);

insert into deal_stages (deal_type, code, name, stage_group, sort_order)
values
  ('procedure', 'exported', 'Выгружена из базы', 'neutral', 1),
  ('procedure', 'participation_assessment', 'Оценка возможности участия', 'neutral', 2),
  ('procedure', 'product_positions_filling', 'Наполнение товарными позициями', 'neutral', 3),
  ('procedure', 'product_positions_review', 'Проверка внесенных позиций', 'neutral', 4),
  ('procedure', 'supplier_selection', 'Подбор поставщиков', 'neutral', 5),
  ('procedure', 'expense_deals_creation', 'Создание затратных сделок', 'neutral', 6),
  ('procedure', 'supplier_responses_waiting', 'Ожидание ответов от поставщиков', 'neutral', 7),
  ('procedure', 'supplier_price_analysis', 'Анализ цен поставщиков', 'neutral', 8),
  ('procedure', 'cost_items_formation', 'Формирование статей затрат', 'neutral', 9),
  ('procedure', 'profitability_calculation', 'Расчет рентабельности', 'neutral', 10),
  ('procedure', 'documents_submission', 'Подача документов', 'neutral', 11)
on conflict (deal_type, code)
do update set
  name = excluded.name,
  stage_group = excluded.stage_group,
  sort_order = excluded.sort_order,
  is_terminal = excluded.is_terminal;

create table if not exists deal_stage_responsibilities (
  stage_id bigint not null references deal_stages(id) on delete cascade,
  actor_type text not null,
  actor_key text not null,
  actor_name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  primary key (stage_id, actor_type, actor_key),
  constraint deal_stage_responsibilities_actor_type_check check (
    actor_type in ('business_role', 'ai', 'external_role')
  ),
  constraint deal_stage_responsibilities_actor_key_not_blank_check check (
    btrim(actor_key) <> ''
  ),
  constraint deal_stage_responsibilities_actor_name_not_blank_check check (
    btrim(actor_name) <> ''
  ),
  constraint deal_stage_responsibilities_sort_order_check check (sort_order > 0),
  constraint deal_stage_responsibilities_stage_order_unique unique (stage_id, sort_order)
);

with responsibilities(stage_code, actor_type, actor_key, actor_name, sort_order) as (
  values
    ('exported', 'business_role', 'manager', 'Менеджер', 1),
    ('participation_assessment', 'business_role', 'sales', 'Специалист отдела продаж', 1),
    ('participation_assessment', 'business_role', 'government', 'Специалист по работе с государственным сегментом', 2),
    ('participation_assessment', 'business_role', 'manager', 'Менеджер', 3),
    ('product_positions_filling', 'ai', 'ai', 'AI', 1),
    ('product_positions_review', 'business_role', 'procurement', 'Специалист отдела закупок', 1),
    ('product_positions_review', 'business_role', 'manager', 'Менеджер', 2),
    ('supplier_selection', 'ai', 'ai', 'AI', 1),
    ('supplier_selection', 'business_role', 'procurement', 'Специалист отдела закупок', 2),
    ('expense_deals_creation', 'ai', 'ai', 'AI', 1),
    ('expense_deals_creation', 'business_role', 'procurement', 'Специалист отдела закупок', 2),
    ('supplier_responses_waiting', 'ai', 'ai', 'AI', 1),
    ('supplier_responses_waiting', 'business_role', 'procurement', 'Специалист отдела закупок', 2),
    ('supplier_price_analysis', 'ai', 'ai', 'AI', 1),
    ('supplier_price_analysis', 'business_role', 'procurement', 'Специалист отдела закупок', 2),
    ('supplier_price_analysis', 'business_role', 'logistics', 'Специалист отдела логистики', 3),
    ('supplier_price_analysis', 'business_role', 'government', 'Специалист по работе с государственным сегментом', 4),
    ('supplier_price_analysis', 'business_role', 'financial_controller', 'Финансовый контроллер', 5),
    ('supplier_price_analysis', 'business_role', 'manager', 'Менеджер', 6),
    ('cost_items_formation', 'ai', 'ai', 'AI', 1),
    ('cost_items_formation', 'business_role', 'procurement', 'Специалист отдела закупок', 2),
    ('cost_items_formation', 'business_role', 'logistics', 'Специалист отдела логистики', 3),
    ('cost_items_formation', 'business_role', 'government', 'Специалист по работе с государственным сегментом', 4),
    ('cost_items_formation', 'business_role', 'financial_controller', 'Финансовый контроллер', 5),
    ('cost_items_formation', 'business_role', 'manager', 'Менеджер', 6),
    ('profitability_calculation', 'ai', 'ai', 'AI', 1),
    ('profitability_calculation', 'business_role', 'financial_controller', 'Финансовый контроллер', 2),
    ('profitability_calculation', 'business_role', 'manager', 'Менеджер', 3),
    ('documents_submission', 'ai', 'ai', 'AI', 1),
    ('documents_submission', 'business_role', 'manager', 'Менеджер', 2),
    ('documents_submission', 'business_role', 'government', 'Специалист по работе с государственным сегментом', 3),
    ('documents_submission', 'business_role', 'legal', 'Специалист юридической службы', 4),
    ('documents_submission', 'business_role', 'financial_controller', 'Финансовый контроллер', 5),
    ('documents_submission', 'business_role', 'accountant', 'Бухгалтер', 6),
    ('documents_submission', 'business_role', 'procurement', 'Специалист отдела закупок', 7),
    ('documents_submission', 'business_role', 'sales', 'Специалист отдела продаж', 8),
    ('documents_submission', 'business_role', 'records', 'Специалист отдела делопроизводства', 9),
    ('documents_submission', 'business_role', 'logistics', 'Специалист отдела логистики', 10),
    ('documents_submission', 'external_role', 'freelance_professional', 'Фрилансер профессионал', 11)
)
insert into deal_stage_responsibilities (
  stage_id,
  actor_type,
  actor_key,
  actor_name,
  sort_order
)
select
  stage.id,
  responsibilities.actor_type,
  responsibilities.actor_key,
  responsibilities.actor_name,
  responsibilities.sort_order
from responsibilities
join deal_stages stage
  on stage.deal_type = 'procedure'
 and stage.code = responsibilities.stage_code
on conflict (stage_id, actor_type, actor_key)
do update set
  actor_name = excluded.actor_name,
  sort_order = excluded.sort_order;

create table if not exists deals (
  id bigint generated always as identity primary key,
  deal_type text not null,
  parent_deal_id bigint references deals(id) on delete restrict,
  stage_id bigint references deal_stages(id) on delete restrict,
  source text not null default 'manual',
  external_id text,
  source_payload jsonb not null default '{}'::jsonb,
  legacy_entity_type text,
  legacy_entity_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_type_check check (
    deal_type in ('procedure', 'expense', 'execution')
  ),
  constraint deals_source_not_blank_check check (btrim(source) <> ''),
  constraint deals_external_id_not_blank_check check (
    external_id is null or btrim(external_id) <> ''
  ),
  constraint deals_source_payload_object_check check (
    jsonb_typeof(source_payload) = 'object'
  ),
  constraint deals_parent_not_self_check check (parent_deal_id is distinct from id),
  constraint deals_legacy_pair_check check (
    (legacy_entity_type is null) = (legacy_entity_id is null)
  ),
  constraint deals_source_external_type_unique unique (source, external_id, deal_type)
);

create unique index if not exists deals_legacy_entity_unique_idx
on deals (legacy_entity_type, legacy_entity_id)
where legacy_entity_type is not null;

create index if not exists deals_type_stage_idx on deals (deal_type, stage_id);
create index if not exists deals_parent_deal_id_idx on deals (parent_deal_id);

create or replace function validate_deal_relationships()
returns trigger as $$
declare
  parent_type text;
  selected_stage_type text;
begin
  if new.deal_type = 'procedure' and new.parent_deal_id is not null then
    raise exception 'A procedure deal cannot have a parent deal';
  end if;

  if new.parent_deal_id is not null then
    select deal_type into parent_type from deals where id = new.parent_deal_id;
    if parent_type is distinct from 'procedure' then
      raise exception 'Expense and execution deals can only be linked to a procedure';
    end if;
  end if;

  if new.stage_id is not null then
    select deal_type into selected_stage_type from deal_stages where id = new.stage_id;
    if selected_stage_type is distinct from new.deal_type then
      raise exception 'The selected stage does not belong to this deal type';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_validate_relationships on deals;

create trigger deals_validate_relationships
before insert or update of deal_type, parent_deal_id, stage_id on deals
for each row
execute function validate_deal_relationships();

drop trigger if exists deal_stages_set_updated_at on deal_stages;

create trigger deal_stages_set_updated_at
before update on deal_stages
for each row
execute function set_updated_at();

drop trigger if exists deals_set_updated_at on deals;

create trigger deals_set_updated_at
before update on deals
for each row
execute function set_updated_at();

insert into deals (
  deal_type,
  stage_id,
  source,
  external_id,
  source_payload,
  legacy_entity_type,
  legacy_entity_id,
  created_at,
  updated_at
)
select
  'procedure',
  coalesce(matched_stage.id, default_stage.id),
  procedure.source,
  procedure.external_id,
  procedure.source_payload,
  'procedure',
  procedure.id,
  procedure.created_at,
  procedure.updated_at
from procedures procedure
join deal_stages default_stage
  on default_stage.deal_type = 'procedure'
 and default_stage.code = 'exported'
left join deal_stages matched_stage
  on matched_stage.deal_type = 'procedure'
 and matched_stage.name = procedure.stage
where not exists (
  select 1
  from deals existing
  where existing.legacy_entity_type = 'procedure'
    and existing.legacy_entity_id = procedure.id
)
on conflict (source, external_id, deal_type)
do update set
  source_payload = excluded.source_payload,
  updated_at = excluded.updated_at;

insert into deals (
  deal_type,
  parent_deal_id,
  source,
  external_id,
  source_payload,
  legacy_entity_type,
  legacy_entity_id,
  created_at,
  updated_at
)
select
  'execution',
  parent.id,
  contract.source,
  contract.external_id,
  contract.source_payload,
  'contract',
  contract.id,
  contract.created_at,
  contract.updated_at
from contracts contract
left join deals parent
  on parent.legacy_entity_type = 'procedure'
 and parent.legacy_entity_id = contract.procedure_id
where not exists (
  select 1
  from deals existing
  where existing.legacy_entity_type = 'contract'
    and existing.legacy_entity_id = contract.id
)
on conflict (source, external_id, deal_type)
do update set
  source_payload = excluded.source_payload,
  updated_at = excluded.updated_at;

create table if not exists product_positions (
  id bigint generated always as identity primary key,
  deal_id bigint not null references deals(id) on delete cascade,
  source_position_id bigint references product_positions(id) on delete set null,
  source text not null default 'manual',
  external_id text,
  position_kind text not null default 'unknown',
  name text,
  description text,
  sku text,
  category text,
  ktru_code text,
  okpd2_code text,
  okei_code text,
  okei_name text,
  quantity numeric(24, 6),
  unit_price numeric(24, 6),
  total_price numeric(24, 2),
  currency text,
  attributes jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  sort_order integer not null default 1,
  created_by uuid references users(id) on delete set null,
  updated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_positions_source_not_blank_check check (btrim(source) <> ''),
  constraint product_positions_external_id_not_blank_check check (
    external_id is null or btrim(external_id) <> ''
  ),
  constraint product_positions_kind_check check (
    position_kind in ('product', 'service', 'work', 'unknown')
  ),
  constraint product_positions_quantity_check check (quantity is null or quantity >= 0),
  constraint product_positions_unit_price_check check (unit_price is null or unit_price >= 0),
  constraint product_positions_total_price_check check (total_price is null or total_price >= 0),
  constraint product_positions_attributes_object_check check (
    jsonb_typeof(attributes) = 'object'
  ),
  constraint product_positions_source_payload_object_check check (
    jsonb_typeof(source_payload) = 'object'
  ),
  constraint product_positions_sort_order_check check (sort_order > 0),
  constraint product_positions_source_not_self_check check (
    source_position_id is distinct from id
  ),
  constraint product_positions_deal_source_external_unique unique (
    deal_id,
    source,
    external_id
  )
);

create index if not exists product_positions_deal_sort_idx
on product_positions (deal_id, sort_order, id);

create index if not exists product_positions_source_position_id_idx
on product_positions (source_position_id);

drop trigger if exists product_positions_set_updated_at on product_positions;

create trigger product_positions_set_updated_at
before update on product_positions
for each row
execute function set_updated_at();

with source_products as (
  select
    deal.id as deal_id,
    row_item.ordinality as row_number,
    product_item.ordinality as product_number,
    product_item.product,
    row_item.row->'tender' as tender
  from deals deal
  cross join lateral jsonb_array_elements(
    coalesce(deal.source_payload->'rows', '[]'::jsonb)
  ) with ordinality as row_item(row, ordinality)
  cross join lateral jsonb_array_elements(
    coalesce(row_item.row->'tender'->'products', '[]'::jsonb)
  ) with ordinality as product_item(product, ordinality)
  where deal.deal_type = 'procedure'
    and deal.source = 'tenderland'
)
insert into product_positions (
  deal_id,
  source,
  external_id,
  name,
  ktru_code,
  okpd2_code,
  okei_code,
  okei_name,
  quantity,
  unit_price,
  total_price,
  currency,
  source_payload,
  sort_order
)
select
  source_products.deal_id,
  'tenderland',
  coalesce(
    nullif(source_products.product->>'id', ''),
    nullif(source_products.product->>'lotProductId', ''),
    concat('row-', source_products.row_number, '-product-', source_products.product_number)
  ),
  nullif(source_products.product->>'lotProductName', ''),
  nullif(source_products.product->>'lotKtruCode', ''),
  nullif(source_products.product->>'lotOkpd2Code', ''),
  nullif(source_products.product->>'lotProductsOkeiCode', ''),
  nullif(source_products.product->>'lotProductsOkeiName', ''),
  case
    when source_products.product->>'lotProductCount' ~ '^[0-9]+([.,][0-9]+)?$'
      then replace(source_products.product->>'lotProductCount', ',', '.')::numeric
  end,
  case
    when source_products.product->>'lotProductPrice' ~ '^[0-9]+([.,][0-9]+)?$'
      then replace(source_products.product->>'lotProductPrice', ',', '.')::numeric
  end,
  case
    when source_products.product->>'lotProductsSum' ~ '^[0-9]+([.,][0-9]+)?$'
      then replace(source_products.product->>'lotProductsSum', ',', '.')::numeric
  end,
  nullif(source_products.tender->>'lotCurrency', ''),
  source_products.product,
  source_products.product_number::integer
from source_products
on conflict (deal_id, source, external_id)
do update set
  name = excluded.name,
  ktru_code = excluded.ktru_code,
  okpd2_code = excluded.okpd2_code,
  okei_code = excluded.okei_code,
  okei_name = excluded.okei_name,
  quantity = excluded.quantity,
  unit_price = excluded.unit_price,
  total_price = excluded.total_price,
  currency = excluded.currency,
  source_payload = excluded.source_payload,
  sort_order = excluded.sort_order;

drop table if exists contracts;
drop table if exists procedures;
