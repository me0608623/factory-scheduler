-- Aggregate-only evidence; no emails, names, password hashes or row contents.
SELECT json_build_object(
  'auth_users', (SELECT count(*) FROM auth.users),
  'employees', (SELECT count(*) FROM public.employees),
  'machines', (SELECT count(*) FROM public.machines),
  'profiles_without_auth', (SELECT count(*) FROM public.profiles p
      LEFT JOIN auth.users u ON u.id=p.user_id WHERE u.id IS NULL),
  'public_rls', (SELECT count(*) FROM pg_policies WHERE schemaname='public')
);
