// Shared Supabase session for all Mi Mundo sections on this origin.
window.miMundoAuth = window.supabase?.createClient(
 'https://rsiivqldgcjxbzujahaw.supabase.co',
 'sb_publishable_lTYDHtayR94yzT6UawYPMw_tUxOtYmo',
 { auth: { storageKey: 'mi-mundo-auth-v1' } }
);
