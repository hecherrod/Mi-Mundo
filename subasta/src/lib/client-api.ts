type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type AuthUser = { id: string; email?: string; user_metadata?: Record<string, string>; email_confirmed_at?: string };
export type MiMundoClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
  auth: {
    getUser: () => Promise<{ data: { user: AuthUser | null }; error: unknown }>;
    signInWithPassword: (input: { email: string; password: string }) => Promise<RpcResult>;
    signUp: (input: { email: string; password: string; options: { data: Record<string, string> } }) => Promise<RpcResult>;
    signOut: () => Promise<RpcResult>;
    resetPasswordForEmail: (email: string, options: { redirectTo: string }) => Promise<RpcResult>;
    updateUser: (input: { password: string }) => Promise<RpcResult>;
    onAuthStateChange: (callback: (event: string) => void) => { data: { subscription: { unsubscribe: () => void } } };
  };
};
declare global { interface Window { miMundoAuth?: MiMundoClient } }

export function authClient() {
  if (!window.miMundoAuth) throw new Error('No se pudo cargar el acceso de Mi Mundo. Recarga la página.');
  return window.miMundoAuth;
}

export async function auctionRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const method = options.method || 'GET';
  const actions: Record<string, string> = {
    'GET /api/bids': 'catalog',
    'POST /api/bids': 'bid',
    'GET /api/auction/profile': 'profile',
    'POST /api/auction/profile': 'save_profile',
    'GET /api/auction/offers': 'offers',
    'GET /api/auction/admin': 'admin',
    'POST /api/auction/admin': 'admin_action',
  };
  const action = actions[`${method} ${path}`];
  if (!action) return Response.json({ error: 'Operación no disponible.' }, { status: 404 });
  const payload = options.body ? JSON.parse(String(options.body)) : {};
  const { data, error } = await authClient().rpc('mi_mundo_auction', { p_action: action, p_data: payload });
  if (error) {
    let message = error.message;
    if (error.code === 'PGRST202') message = 'Estamos activando la base de la subasta. Tu cuenta de Mi Mundo ya está disponible. Intenta más tarde.';
    return Response.json({ error: message }, { status: 503 });
  }
  const result = data as { error?: string; status?: number };
  return Response.json(result, { status: result?.status || (result?.error ? 400 : 200) });
}
