// Anonymous, first-party counters. Never send full URLs, names, email or PINs.
(() => {
  if (window.miMundoTraffic || !['mundo.cositasdeh.mx', 'hecherrod.github.io'].includes(location.hostname)) return;
  const endpoint = 'https://rsiivqldgcjxbzujahaw.supabase.co/rest/v1/rpc/mi_mundo_track';
  const key = 'sb_publishable_lTYDHtayR94yzT6UawYPMw_tUxOtYmo';
  const memory = new Map();
  const read = (storage, name) => { try { return JSON.parse(storage.getItem(name)); } catch { return memory.get(name); } };
  const write = (storage, name, value) => { memory.set(name, value); try { storage.setItem(name, JSON.stringify(value)); } catch {} };
  const storage = (name) => { try { return window[name]; } catch { return { getItem: () => null, setItem: () => {} }; } };
  const local = storage('localStorage'), session = storage('sessionStorage');
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  function section() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'Mi-Mundo') parts.shift();
    const slug = parts[0] || 'inicio';
    if (['estadisticas', 'privacidad'].includes(slug)) return null;
    if (['martes-domingo', 'martes-de-domino'].includes(slug)) return 'domino';
    return /^[a-z0-9][a-z0-9-]{0,59}$/.test(slug) ? slug : null;
  }
  let pending = Array.isArray(read(session, 'mm-traffic-pending')) ? read(session, 'mm-traffic-pending').slice(-40) : [];
  let sending = false;
  async function flush() {
    if (sending || !pending.length || navigator.onLine === false) return;
    sending = true;
    try {
      while (pending.length) {
        const event = pending[0];
        const response = await fetch(endpoint, { method: 'POST', keepalive: true,
          headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
        if (!response.ok) break;
        pending.shift();
        write(session, 'mm-traffic-pending', pending);
      }
    } catch {} finally { sending = false; }
  }
  function track(kind = 'pageview') {
    const current = section();
    if (!current || read(local, 'mm-traffic-disabled') === true) return;
    const now = Date.now();
    let visitor = read(local, 'mm-traffic-visitor');
    if (!visitor || !uuid(visitor.id) || now - visitor.at > 180 * 86400000) {
      visitor = { id: crypto.randomUUID(), at: now };
      write(local, 'mm-traffic-visitor', visitor);
    }
    let visit = read(session, 'mm-traffic-session');
    if (!visit || !uuid(visit.id) || now - visit.at > 1800000) visit = { id: crypto.randomUUID(), sequence: 0 };
    visit.at = now;
    visit.sequence = (Number.isInteger(visit.sequence) ? visit.sequence : 0) + 1;
    write(session, 'mm-traffic-session', visit);
    const league = new URLSearchParams(location.search).get('liga');
    const event = { p_event_id: crypto.randomUUID(), p_visitor_id: visitor.id, p_session_id: visit.id,
      p_sequence: visit.sequence, p_section: current,
      p_area: current === 'domino' && ['ensenada', 'todos-santos'].includes(league) ? league : '', p_kind: kind };
    pending.push(event);
    pending = pending.slice(-40);
    write(session, 'mm-traffic-pending', pending);
    void flush();
  }
  window.miMundoTraffic = { track };
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || section() !== 'libro') return;
    const url = new URL(link.href, location.href);
    if (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/')) track('book_form');
    if (url.hostname === 'mpago.la') track('book_payment');
  });
  addEventListener('online', flush);
  addEventListener('pageshow', event => { if (event.persisted) track(); });
  setInterval(flush, 15000);
  track();
})();
