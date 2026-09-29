# Run locally. Password is never saved. New full backup precedes any schema write.
param([string]$ToolDirectory='C:\Users\me060\Downloads\factory-scheduler-release-tools\pgsql-bin',
      [string]$BackupDirectory='C:\Users\me060\Downloads\factory-scheduler-backups')
$ErrorActionPreference='Stop'
$repoDirectory=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$psql=Join-Path $ToolDirectory 'psql.exe';$dump=Join-Path $ToolDirectory 'pg_dump.exe';$restore=Join-Path $ToolDirectory 'pg_restore.exe'
foreach($tool in @($psql,$dump,$restore)){if(-not(Test-Path -LiteralPath $tool)){throw 'PostgreSQL tools are missing'}}
$common=@('--host=aws-0-ap-northeast-1.pooler.supabase.com','--port=5432','--username=postgres.kjnnguekhshkhgycmryl','--dbname=postgres','--no-psqlrc','--no-password','--set=ON_ERROR_STOP=1')
$baselineSql="select json_build_object('version',version,'pending',setup_pending,'employees',(select count(*) from employees where active),'resources',(select count(*) from machines where active),'blocks',(select count(*) from schedule_blocks),'groups',(select count(*) from staff_groups where active),'new_tables',(select count(*) from pg_tables where schemaname='public' and tablename in ('planning_scenarios','work_execution','work_contents','transfer_orders','staff_rosters'))) from schedule_state;"
$ptr=[IntPtr]::Zero
$priorEncoding=$OutputEncoding
try {
  Write-Host 'Enter database password locally. This backs up the full DB and adds migrations 0021-0024; existing roster data stays unchanged.'
  $secret=Read-Host 'Database password' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $env:PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='15';$env:PGCLIENTENCODING='UTF8'
  $OutputEncoding=[Text.UTF8Encoding]::new($false)
  $baselineText=& $psql @common -At --command=$baselineSql
  if($LASTEXITCODE -ne 0){throw 'Preflight read failed; no changes made'}
  $baseline=($baselineText -join '')|ConvertFrom-Json
  if($baseline.version -ne 3 -or -not $baseline.pending -or $baseline.employees -ne 30 -or $baseline.resources -ne 45 -or $baseline.blocks -ne 0 -or $baseline.groups -ne 7 -or $baseline.new_tables -ne 0){throw 'Baseline differs from reviewed version 3; STOP and re-review, do not retry writes'}
  New-Item -ItemType Directory -Path $BackupDirectory -Force|Out-Null
  $backup=Join-Path $BackupDirectory ('supabase-pre-workflow-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.dump')
  if(Test-Path -LiteralPath $backup){throw 'Backup target exists; refusing overwrite'}
  & $dump --host=aws-0-ap-northeast-1.pooler.supabase.com --port=5432 --username=postgres.kjnnguekhshkhgycmryl --dbname=postgres --no-password --format=custom --blobs --file=$backup
  if($LASTEXITCODE -ne 0 -or (Get-Item -LiteralPath $backup).Length -le 0){throw 'Full backup failed; migrations not applied'}
  & $restore --list $backup|Out-Null
  if($LASTEXITCODE -ne 0){throw 'Backup directory cannot be read; migrations not applied'}
  & $restore --file=NUL $backup
  if($LASTEXITCODE -ne 0){throw 'Full backup decompression failed; migrations not applied'}
  Write-Host ('BACKUP_OK '+$backup)
  Write-Host ('BACKUP_SHA256 '+(Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash)
  $sql=@'
set lock_timeout='10s'; set statement_timeout='90s';
lock table schedule_state in exclusive mode;
do $$ begin
 if not exists(select 1 from schedule_state where version=3 and setup_pending) then raise exception 'Baseline moved'; end if;
end $$;
create temporary table release_baseline as
 select 'employees' as name,md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) as hash from employees t
 union all select 'machines',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from machines t
 union all select 'profiles',md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id)::text,'')) from profiles t
 union all select 'staff_groups',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from staff_groups t;
'@
  foreach($name in @('0021_scenarios_execution.sql','0022_work_contents_assignments.sql','0023_cross_factory_transfers.sql','0024_staff_roster_drafts.sql')){
    $sql+="`n"+(Get-Content -LiteralPath (Join-Path $repoDirectory ('db\migrations\'+$name)) -Raw -Encoding UTF8)
  }
  $sql+=@'

do $$ begin
 if exists(select 1 from release_baseline b join (
  select 'employees' as name,md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) as hash from employees t
  union all select 'machines',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from machines t
  union all select 'profiles',md5(coalesce(jsonb_agg(to_jsonb(t) order by user_id)::text,'')) from profiles t
  union all select 'staff_groups',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from staff_groups t
 ) a using(name) where a.hash<>b.hash) then raise exception 'Existing roster/profile data changed'; end if;
 if not exists(select 1 from schedule_state where version=3 and setup_pending) then raise exception 'State changed'; end if;
 if exists(select 1 from schedule_blocks) then raise exception 'Unexpected production blocks'; end if;
end $$;
select 'MIGRATIONS_0021_0024_COMMITTED';
'@
  $sql|& $psql @common --single-transaction --file=-
  if($LASTEXITCODE -ne 0){throw 'Migration transaction rolled back; inspect before retry'}
  Write-Host 'RELEASE_SCHEMA_OK. Full backup verified; existing roster preserved; automatic scheduling still pending.'
} finally {
  $OutputEncoding=$priorEncoding
  Remove-Item Env:PGPASSWORD,Env:PGSSLMODE,Env:PGCONNECT_TIMEOUT,Env:PGCLIENTENCODING -ErrorAction SilentlyContinue
  if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  $secret=$null
}
