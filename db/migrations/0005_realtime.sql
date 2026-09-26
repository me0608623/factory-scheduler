-- 即時推送：這些資料表一有變動，所有打開的畫面（電視、手機、平板）都會收到
alter publication supabase_realtime add table
  schedule_blocks, schedule_state, change_sets, machine_faults, leaves, orders, calendar_days;
