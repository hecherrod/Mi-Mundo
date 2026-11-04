(() => {
  const by = id => document.getElementById(id);
  const client = window.miMundoAuth;
  function exclusionState() {
    try {
      const excluded = localStorage.getItem('mm-traffic-disabled') === 'true';
      by('excludeBrowser').checked = excluded;
      by('exclusionStatus').textContent = excluded ? 'Este navegador está excluido de los contadores y recorridos.' : 'Este navegador todavía puede contar visitas cuando no tengas sesión de administrador.';
    } catch { by('exclusionStatus').textContent = 'El navegador no permite guardar esta preferencia. Tus visitas con sesión de administrador se excluyen igualmente.'; }
  }
  function excludeBrowser(excluded) {
    try {
      localStorage.setItem('mm-traffic-disabled', JSON.stringify(excluded));
      if (excluded) sessionStorage.setItem('mm-traffic-pending', '[]');
      exclusionState();
    } catch { by('exclusionStatus').textContent = 'No se pudo guardar la preferencia. Tus visitas con sesión de administrador se excluyen igualmente.'; }
  }
  by('excludeBrowser').onchange = event => excludeBrowser(event.target.checked);
  exclusionState();
  const names = { inicio: 'Mi Mundo', subasta: 'Subasta', libro: 'Libro', domino: 'Dominó', ensenada: 'Ensenada', 'todos-santos': 'Todos Santos', 'laboratorio-digital-cria': 'Laboratorio Digital CRIA', 'laboratorio-digital-cria--cotizador-giclees': 'Cotizador de Gicleés' };
  const name = key => names[key] || key;
  const number = value => Number(value || 0).toLocaleString('es-MX');
  function status(text, error = false) { by('status').textContent = text; by('status').className = error ? 'error' : ''; }
  function card(target, label, value) {
    const box = document.createElement('div'); box.className = 'card';
    const count = document.createElement('span'); count.className = 'number'; count.textContent = number(value);
    const text = document.createElement('span'); text.textContent = label;
    box.append(count, text); by(target).append(box);
  }
  function row(target, values) {
    const tr = document.createElement('tr');
    values.forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); });
    by(target).append(tr);
  }
  function render(data) {
    ['totals', 'sections', 'routes', 'registrations', 'actions', 'leagues', 'registeredLeagues'].forEach(id => by(id).replaceChildren());
    card('totals', 'Visitas en todo Mi Mundo', data.total.views);
    card('totals', 'Visitantes en todo Mi Mundo', data.total.visitors);
    card('totals', 'Sesiones', data.total.sessions);
    by('since').textContent = data.started_at ? 'Medición desde ' + new Date(data.started_at).toLocaleString('es-MX', { timeZone: 'America/Tijuana' }) + ' · hora de Tijuana.' : 'Aún no hay visitas registradas. Los contadores comienzan al activar la medición.';
    const sections = new Map(data.sections.map(s => [s.section, s]));
    for (const key of ['inicio', 'subasta', 'libro', 'domino', 'laboratorio-digital-cria', 'laboratorio-digital-cria--cotizador-giclees']) if (!sections.has(key)) sections.set(key, { section: key, views: 0, visitors: 0, sessions: 0 });
    sections.forEach(s => row('sections', [name(s.section), number(s.views), number(s.visitors), number(s.sessions)]));
    data.leagues.forEach(l => { const p = document.createElement('p'); p.textContent = `Dominó · ${name(l.area)}: ${number(l.views)} visitas · ${number(l.visitors)} visitantes`; by('leagues').append(p); });
    if (!data.routes.length) row('routes', ['Aún no hay recorridos registrados.', '—']);
    data.routes.forEach(r => row('routes', [r.route.split(' → ').map(name).join(' → '), number(r.sessions)]));
    const regs = data.registrations;
    card('registrations', 'Cuentas generales', regs.accounts);
    card('registrations', 'Cuentas con correo confirmado', regs.confirmed);
    card('registrations', 'Registros de subasta', regs.auction);
    card('registrations', 'Participantes de dominó', regs.domino);
    regs.domino_leagues.forEach(l => { const p = document.createElement('p'); p.textContent = `${name(l.league)}: ${number(l.participants)} participantes con nombre reservado`; by('registeredLeagues').append(p); });
    card('actions', 'Clics al formulario del libro', data.actions.book_form);
    card('actions', 'Clics al pago del libro', data.actions.book_payment);
  }
  async function load() {
    by('refresh').disabled = true;
    status('Consultando estadísticas…');
    try {
      if (!client) throw Error('No se pudo cargar el acceso. Recarga la página.');
      const { data: { user } } = await client.auth.getUser();
      if (!user) { by('report').hidden = true; by('login').hidden = false; status(''); return; }
      const { data, error } = await client.rpc('mi_mundo_traffic_report', { p_days: Number(by('days').value) });
      if (error) throw Error(error.code === '42501' ? 'Esta cuenta no es el administrador general de Mi Mundo.' : 'No se pudieron consultar las estadísticas. Intenta de nuevo.');
      excludeBrowser(true);
      render(data); by('report').hidden = false; by('login').hidden = true; status('Actualizado · ' + new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Tijuana' }));
    } catch (error) { by('report').hidden = true; by('login').hidden = false; status(error.message, true); }
    finally { by('refresh').disabled = false; }
  }
  by('loginForm').onsubmit = async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try {
      if (!client) throw Error('No se pudo cargar el acceso. Recarga la página.');
      status('Comprobando acceso…');
      const { error } = await client.auth.signInWithPassword({ email: by('email').value.trim(), password: by('password').value });
      by('password').value = '';
      if (error) throw Error('No se pudo iniciar sesión. Revisa el correo, el PIN y la confirmación del correo.');
      await load();
    } catch (error) { status(error.message, true); } finally { button.disabled = false; }
  };
  by('days').onchange = load; by('refresh').onclick = load;
  by('logout').onclick = async () => { await client.auth.signOut(); location.reload(); };
  client?.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') { by('report').hidden = true; by('login').hidden = false; } });
  void load();
})();
