-- Runs ONLY inside psql --single-transaction. No persistent helper or row writes.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL client_min_messages='warning';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND (n.nspname='public' OR (n.nspname='auth' AND c.relname IN ('users','identities')))
    ORDER BY n.nspname,c.relname
  LOOP
    -- App writes are held briefly; auth tables require only SELECT privilege.
    -- A concurrent auth update still fails the before/after comparison safely.
    EXECUTE format('LOCK TABLE %I.%I IN %s MODE',r.nspname,r.relname,CASE WHEN r.nspname='auth' THEN 'ACCESS SHARE' ELSE 'SHARE' END);
  END LOOP;
END $$;
CREATE FUNCTION pg_temp.release_fingerprint() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r record; result jsonb='{}'; cnt bigint; hash text;
BEGIN
  FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND (n.nspname='public' OR (n.nspname='auth' AND c.relname IN ('users','identities')))
    ORDER BY n.nspname,c.relname
  LOOP
    EXECUTE format('SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex''),'''' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'')),''''),''UTF8'')),''hex'') FROM %I.%I t',r.nspname,r.relname) INTO cnt,hash;
    result=result||jsonb_build_object(r.nspname||'.'||r.relname,jsonb_build_object('count',cnt,'sha256',hash));
  END LOOP;
  result=result||jsonb_build_object('roles',(SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY rolname),''),'UTF8')),'hex') FROM pg_roles t));
  result=result||jsonb_build_object('rls',(SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY schemaname,tablename,policyname),''),'UTF8')),'hex') FROM pg_policies t WHERE schemaname IN ('public','auth')));
  result=result||jsonb_build_object('sequences',(SELECT encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY schemaname,sequencename),''),'UTF8')),'hex') FROM pg_sequences t WHERE schemaname='public'));
  RETURN result;
END $$;
CREATE TEMP TABLE release_before(snapshot jsonb) ON COMMIT DROP;
INSERT INTO release_before VALUES(pg_temp.release_fingerprint());
