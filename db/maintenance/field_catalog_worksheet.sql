-- ============================================================================
-- 現場資料核對工作表（在 Supabase SQL Editor 使用）
-- 依 2026-10-02 盤點結果編製。原則：
--   1. 只放「查詢」與「註解掉的範本」——真實值一律由現場核對後填入，不預設
--   2. 每個修改區塊都可以單獨執行；建議整批包 BEGIN; ... COMMIT;（不確定就 ROLLBACK;）
--   3. 動任何資料前，先到 GitHub Actions 手動觸發「每日資料庫備份」產生最新備份
--   4. 員工以編號（code／source_employee_code）識別，不用姓名
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 0. 現況總覽（先跑這些，和盤點報告對照）
-- ─────────────────────────────────────────────────────────────
select id, label, factory, process, active, review_status
from machines order by factory, id;                        -- 45 台工序仍為「待確認」

select count(*) as 技能筆數 from employee_skills;           -- 目前僅示範資料 15 筆
select count(*) as 模具筆數 from machine_products;          -- 目前 0 筆
select code, name, active from products order by code;      -- 目前僅示範 P1–P3（停用）

select '啟用中無技能' as 項目, factory, count(*) from employees
where active and not exists (select 1 from employee_skills s where s.employee_id=employees.id)
group by factory;

-- ─────────────────────────────────────────────────────────────
-- A. 機台工序指派（45 台「待確認」→ 實際工序）
--    範本：把下面註解拿掉、依現場核對填入工序名（工序名要存在於 processes 表）
-- ─────────────────────────────────────────────────────────────
-- select name from processes order by sort;                -- 先看可用工序名稱
-- update machines set process='裁切'    where id='f1e';    -- 範例列，值請依現場
-- update machines set process='焊接'    where id='f1b';
-- update machines set process='沖壓'    where id='f2k';
-- update machines set process='包裝'    where id='f2ac';
-- （其餘機台逐台比照；可用 values 清單對照紙本）

-- ─────────────────────────────────────────────────────────────
-- B. 機台模具（machine_products：哪台機台可做哪個產品）
-- ─────────────────────────────────────────────────────────────
-- update products set active=true where code='（實際產品編號）';   -- 或見 D 段新增產品
-- insert into machine_products (machine_id, product_id)
-- select m.id, p.id from machines m, products p
--  where m.id='f1e' and p.code='（產品編號）' on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- C. 員工技能（誰會操作哪台機台；用員工編號找 id）
-- ─────────────────────────────────────────────────────────────
-- insert into employee_skills (employee_id, machine_id)
-- select e.id, m.id from employees e, machines m
--  where e.code='（員工編號）' and m.id='f1e' on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- D. 產品與工序速率（rate＝一件/分/人；transfer_batch＝前站累計幾件可流轉，0＝前站全部完成）
-- ─────────────────────────────────────────────────────────────
-- insert into products (code, name) values ('（產品編號）','（品名）');
-- insert into product_steps (product_id, seq, process, rate, transfer_batch, factory)
-- select p.id, 0, '裁切', 2, 60, 1 from products p where p.code='（產品編號）';   -- 值請依現場

-- ─────────────────────────────────────────────────────────────
-- E. 每週休假日（0=週日…6=週六；目前七天全開）與單日調整
-- ─────────────────────────────────────────────────────────────
-- update calendar_weekly set is_open=false where weekday in (0, 6);   -- 週六日休
-- insert into calendar_days (date, is_open, note) values ('2026-10-10', false, '國慶日休')
--   on conflict (date) do update set is_open=false, note=excluded.note;

-- ─────────────────────────────────────────────────────────────
-- F. 不加班名冊（目前 31/35 人設不加班——請現場確認是否屬實）
-- ─────────────────────────────────────────────────────────────
-- select code, name, no_overtime from employees where active and no_overtime;
-- update employees set no_overtime=false where code='（員工編號）';

-- ─────────────────────────────────────────────────────────────
-- G.（選用）示範資料清理——先跑 SELECT 檢視，確認後再改成 delete
--    示範員工：張三/李四/王五/陳六/林七（停用中）；示範機台 a–e；示範產品 P1–P3
-- ─────────────────────────────────────────────────────────────
-- select code, name from employees where name in ('張三','李四','王五','陳六','林七');
-- select id, label from machines where id in ('a','b','c','d','e');
-- delete from employee_skills where machine_id in ('a','b','c','d','e');
-- delete from employees where name in ('張三','李四','王五','陳六','林七') and not exists (
--   select 1 from profiles p where p.employee_id=employees.id);   -- 有帳號綁定的先不要刪
-- delete from machines where id in ('a','b','c','d','e');
-- delete from products where code in ('P1','P2','P3');

-- ─────────────────────────────────────────────────────────────
-- I.（選用）廠區平面圖佈局：machine_layout 的 x/y 是 0–100 的廠內座標
--    沒填也能用——平面圖會自動按工序排列；填了就固定位置
-- ─────────────────────────────────────────────────────────────
-- select id, label from machines where factory=1 order by id;
-- insert into machine_layout (machine_id, x, y) values ('f1e', 10, 10) on conflict (machine_id) do update set x=excluded.x, y=excluded.y;
-- 一批填：直接在 SQL 用 values 清單對照紙本廠區圖

-- ─────────────────────────────────────────────────────────────
-- H. 完成核對後：解除排程鎖定（最後一步；正式解除前建議重跑兩個演練工作流）
-- ─────────────────────────────────────────────────────────────
-- update schedule_state set setup_pending=false;
-- 之後到 GitHub Actions：手動觸發「備份還原演練」「隔離驗證（權限與排程）」各一次
