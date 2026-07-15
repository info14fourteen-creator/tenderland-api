alter table procedures
add column if not exists stage text;

create index if not exists procedures_stage_idx
on procedures (stage);
