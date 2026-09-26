-- 產線排程系統：資料表
-- 資料模型參考開源 APS frePPLe 的分法：產品(item)／工序(operation)／資源(resource)／技能(skill)／日曆(calendar)／需求(demand)
-- 時間一律用「日期 + 當天第幾分鐘」表示（480 = 08:00），和畫面、排程服務一致

-- gen_random_uuid() 是 PostgreSQL 13 以後內建的，不需要額外 extension

create type app_role as enum ('boss', 'lead', 'worker', 'viewer');

-- ---------- 基本資料 ----------
create table employees (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  color       smallint not null default 0,
  no_overtime boolean not null default false,        -- 不能加班（也不排國定假日、週末出勤）
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role         app_role not null default 'viewer',
  employee_id  uuid references employees (id) on delete set null,   -- 這個帳號是哪位員工
  created_at   timestamptz not null default now()
);

create table processes (                               -- 工序類型：裁切、沖壓、焊接…
  name text primary key,
  sort smallint not null default 0
);

create table machines (
  id         text primary key check (id ~ '^[a-z0-9]{1,8}$'),
  label      text not null,
  process    text not null references processes (name) on update cascade,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table employee_skills (                         -- 誰會操作哪台機台
  employee_id uuid references employees (id) on delete cascade,
  machine_id  text references machines (id) on delete cascade on update cascade,
  primary key (employee_id, machine_id)
);

create table products (
  id         uuid primary key default gen_random_uuid(),
  code       text unique,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_steps (                           -- 標準工序公式
  product_id     uuid references products (id) on delete cascade,
  seq            smallint not null check (seq >= 0),   -- 第幾站（0 開始，順序不能跳）
  process        text not null references processes (name) on update cascade,
  rate           numeric(8, 3) not null check (rate > 0),              -- 一個人每分鐘做幾件
  transfer_batch integer not null default 0 check (transfer_batch >= 0), -- 前站完成幾件就能傳下站；0 = 前站全部完成
  primary key (product_id, seq)
);

create table machine_products (                        -- 機台有哪些產品的模具
  machine_id text references machines (id) on delete cascade on update cascade,
  product_id uuid references products (id) on delete cascade,
  primary key (machine_id, product_id)
);

-- ---------- 日曆 ----------
create table work_windows (                            -- 每天的上班時段
  id          smallint primary key,
  start_min   smallint not null,
  end_min     smallint not null check (end_min > start_min),
  is_overtime boolean not null default false
);
insert into work_windows values (1, 480, 720, false), (2, 780, 1020, false), (3, 1020, 1200, true);

create table calendar_weekly (                         -- 每週固定上班的日子（0 = 週日）
  weekday smallint primary key check (weekday between 0 and 6),
  is_open boolean not null
);
insert into calendar_weekly values (0, false), (1, true), (2, true), (3, true), (4, true), (5, true), (6, true);

create table holidays (                                -- 國定假日：只是標示，要不要上班看 calendar_days
  date date primary key,
  name text not null
);

create table calendar_days (                           -- 單日調整
  date       date primary key,
  is_open    boolean,                                  -- null = 照每週設定
  overtime   boolean not null default false,           -- 開加班到 20:00
  note       text,
  updated_at timestamptz not null default now()
);

-- ---------- 狀況 ----------
create table leaves (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  date        date not null,
  start_min   smallint,                                -- null = 全天
  end_min     smallint,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (employee_id, date)
);

create table machine_faults (
  id              uuid primary key default gen_random_uuid(),
  machine_id      text not null references machines (id) on delete cascade on update cascade,
  date            date not null,
  start_min       smallint not null,
  end_min         smallint not null check (end_min > start_min),
  note            text,
  fixed_at        timestamptz,                         -- 按「修好了」的時間
  original_blocks jsonb not null default '[]',         -- 故障前原本的排程位置，恢復時「搬回原位」用
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now()
);
create index machine_faults_date_idx on machine_faults (date);

-- ---------- 工單 ----------
create table orders (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  product_id uuid not null references products (id),
  qty        integer not null check (qty > 0),
  due_date   date not null,                            -- 最晚完成日（硬性期限）
  priority   smallint not null default 2 check (priority between 0 and 3),  -- 0 特急、1 急、2 一般、3 不急
  status     text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 排程 ----------
create table schedule_state (                          -- 只有一列；version 防止兩個人同時改
  id         boolean primary key default true check (id),
  version    bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into schedule_state default values;

create table schedule_blocks (                         -- 排程表上的每一段工作
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id) on delete cascade,
  step_seq    smallint not null,
  machine_id  text not null references machines (id) on update cascade,
  employee_id uuid references employees (id) on delete set null,
  date        date not null,
  start_min   smallint not null check (start_min between 0 and 1440),
  end_min     smallint not null check (end_min > start_min and end_min <= 1440),
  qty         integer not null check (qty > 0),
  pinned      boolean not null default false,          -- 手動固定，自動排程不會動
  created_at  timestamptz not null default now()
);
create index schedule_blocks_date_idx on schedule_blocks (date);
create index schedule_blocks_order_idx on schedule_blocks (order_id, step_seq);

create table plan_previews (                           -- 排程服務算好、還沒套用的方案
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,
  title          text not null,
  event          jsonb not null,
  base_version   bigint not null,
  options        jsonb not null,                       -- [{id, name, desc, summary, metrics, lines, people, shifts, blocks, effects}]
  applied_option text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '2 hours'
);

create table change_sets (                             -- 每次套用的變更紀錄（給人看的）
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('fault', 'recover', 'leave', 'order', 'auto', 'move', 'edit', 'import')),
  title          text not null,
  summary        text,
  detail         jsonb not null default '{}',          -- lines、shifts、people、alts
  ai             jsonb,
  note           text,
  preview_id     uuid references plan_previews (id) on delete set null,
  option_id      text,
  version_before bigint,
  version_after  bigint,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index change_sets_created_idx on change_sets (created_at desc);

-- ---------- 現場回報（第 2 階段） ----------
create table progress_reports (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid references schedule_blocks (id) on delete set null,
  employee_id uuid references employees (id),
  started_at  timestamptz,
  finished_at timestamptz,
  qty_done    integer check (qty_done >= 0),
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ---------- updated_at ----------
create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger employees_updated before update on employees for each row execute function set_updated_at();
create trigger machines_updated before update on machines for each row execute function set_updated_at();
create trigger products_updated before update on products for each row execute function set_updated_at();
create trigger orders_updated before update on orders for each row execute function set_updated_at();
create trigger calendar_days_updated before update on calendar_days for each row execute function set_updated_at();
