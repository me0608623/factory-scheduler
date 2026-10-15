-- Read-only scope inventory; written inside the encrypted archive, never logs.
SELECT json_build_object(
  'schemas', (SELECT json_agg(nspname ORDER BY nspname) FROM pg_namespace
              WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'),
  'storageObjects', (SELECT count(*) FROM storage.objects)
);
