DO $$
BEGIN
  IF (SELECT snapshot FROM release_before) IS DISTINCT FROM pg_temp.release_fingerprint() THEN
    RAISE EXCEPTION 'Release data changed; migration rolled back';
  END IF;
  IF public.role_has_permission('lead','rush.manage') IS DISTINCT FROM true
     OR public.role_has_permission('lead','worklog.manage') IS DISTINCT FROM true
     OR public.role_has_permission('lead','master.manage') IS DISTINCT FROM false
     OR public.role_has_permission('worker','rush.manage') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '0037 permission behavior verification failed';
  END IF;
END $$;
DROP FUNCTION pg_temp.release_fingerprint();
