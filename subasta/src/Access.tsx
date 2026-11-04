import { useEffect, useState } from 'react';
import { authClient } from './lib/client-api';

export default function Access() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'recovery'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  useEffect(() => {
    const { data } = authClient().auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setMode('recovery');
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const client = authClient();
      if (mode === 'reset') {
        const redirectTo = new URL('/subasta/?vista=acceso', window.location.origin).href;
        const result = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (result.error) throw new Error(result.error.message);
        setMessage('Revisa tu correo. Si la cuenta existe, recibirás las instrucciones para recuperar el PIN.');
      } else if (mode === 'recovery') {
        const result = await client.auth.updateUser({ password: pin });
        if (result.error) throw new Error(result.error.message);
        setMessage('PIN actualizado para tu cuenta de Mi Mundo. Ya puedes volver a la subasta.');
      } else if (mode === 'signup') {
        const result = await client.auth.signUp({ email: email.trim(), password: pin, options: { data: { name: name.trim(), full_name: name.trim() } } });
        if (result.error) throw new Error(result.error.message);
        setConfirmEmail(true);
        setPin('');
        setMessage('Confirma tu correo para poder entrar. Abre el mensaje de Mi Mundo, pulsa el enlace de confirmación y vuelve aquí para iniciar sesión. Si ya tienes cuenta en Dominó, entra con tu correo y PIN habituales.');
      } else {
        const result = await client.auth.signInWithPassword({ email: email.trim(), password: pin });
        if (result.error) {
          if (/confirm/i.test(result.error.message)) throw new Error('Primero confirma tu correo. Busca el mensaje de Mi Mundo y pulsa su enlace de confirmación.');
          throw new Error('No pudimos iniciar sesión. Revisa tu correo, PIN y la confirmación de tu cuenta.');
        }
        const target = new URLSearchParams(location.search).get('volver') === 'gestion' ? 'gestion' : 'cuenta';
        location.assign(`/subasta/?vista=${target}`);
      }
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="account-page">
    <a className="back-link" href="/subasta/">← Volver a la subasta</a>
    <span className="eyebrow">UNA CUENTA PARA MI MUNDO</span>
    <h1>{mode === 'signup' ? 'Crea tu cuenta' : mode === 'reset' || mode === 'recovery' ? 'Recupera tu acceso' : 'Entra a la subasta'}</h1>
    <p>Usa el mismo correo y PIN de Mi Mundo. Tu cuenta también sirve para las demás secciones conectadas, como Martes de Dominó.</p>
    <form className="profile-form" onSubmit={submit}>
      {mode === 'signup' && <label>Nombre<input required maxLength={80} minLength={2} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>}
      {mode !== 'recovery' && <label>Correo<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>}
      {mode !== 'reset' && <label>{mode === 'recovery' ? 'PIN nuevo' : 'PIN de Mi Mundo'}<input required type="password" pattern="[0-9]{6,8}" inputMode="numeric" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} title="De 6 a 8 dígitos" value={pin} onChange={event => setPin(event.target.value)} /></label>}
      <button className="primary" disabled={busy}>{busy ? 'Procesando…' : mode === 'signup' ? 'Registrarme' : mode === 'reset' ? 'Enviar recuperación' : mode === 'recovery' ? 'Guardar PIN' : 'Entrar'}</button>
    </form>
    {message && <div className={confirmEmail ? 'trial-banner' : 'feedback'} role="status">{message}</div>}
    <div className="notice-actions"><button className="outline" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(''); setConfirmEmail(false); }}>{mode === 'signup' ? 'Ya confirmé, iniciar sesión' : 'Crear cuenta'}</button><button className="outline" onClick={() => { setMode('reset'); setMessage(''); }}>Olvidé mi PIN</button></div>
  </main>;
}
