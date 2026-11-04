'use client';
import { auctionRequest } from '../../lib/client-api';
import { useEffect, useState } from 'react';
import { lots } from '../../lib/catalog';
import type { Offer } from '../../lib/types';

const money = (amount: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
const date = (time: number) => new Date(time).toLocaleString('es-MX', { timeZone: 'America/Tijuana', dateStyle: 'medium', timeStyle: 'short' });
type Settings = { bankName: string; bankAccount: string; beneficiary: string };

export default function Account() {
  const [form, setForm] = useState({ name: '', email: '', whatsapp: '', consent: false, accepted: false });
  const [offers, setOffers] = useState<Offer[]>([]);
  const [settings, setSettings] = useState<Settings>({ bankName: '', bankAccount: '', beneficiary: '' });
  const [message, setMessage] = useState('');
  const [signedIn, setSignedIn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  async function refreshOffers() {
    const response = await auctionRequest('/api/auction/offers');
    const data = await response.json() as { offers: Offer[]; paymentSettings: Settings; error?: string };
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok) throw new Error(data.error || 'No se pudieron consultar tus resultados.');
    setOffers(data.offers);
    setSettings(data.paymentSettings);
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await auctionRequest('/api/auction/profile');
        const data = await response.json() as { profile?: { name: string; email: string; whatsapp: string; whatsapp_consent: number }; accountEmail?: string; registered?: boolean; error?: string };
        if (response.status === 401) { setSignedIn(false); return; }
        if (!response.ok) throw new Error(data.error || 'No se pudo consultar tu cuenta.');
        if (data.profile) setForm({ ...data.profile, consent: !!data.profile.whatsapp_consent, accepted: data.registered === true });
        else setForm(current => ({ ...current, email: data.accountEmail || '' }));
        await refreshOffers();
      } catch (error) { setMessage((error as Error).message); }
    }
    load();
    const poll = setInterval(() => refreshOffers().catch(error => setMessage(error.message)), 15000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await auctionRequest('/api/auction/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo guardar el registro.');
      setMessage('Registro guardado. Ya puedes pujar sin depósito.');
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="account-page">
    <a href="/subasta/" className="back-link">← Volver al catálogo</a>
    <span className="eyebrow">PARTICIPA SIN DEPÓSITO</span>
    <h1>Mi cuenta y mis resultados</h1>
    <p>Registra tu correo y WhatsApp. Si ganas, recibirás instrucciones y tendrás 24 horas desde el envío para pagar. Si el plazo vence, la obra se ofrece al siguiente postor por su propia puja.</p>
    <p className="trial-banner">Edición de muestra. Los pagos y avisos externos requieren que la organización configure sus cuentas de cobro y mensajería.</p>
    {!signedIn ? <a className="primary" href="/subasta/?vista=acceso&volver=cuenta" target="_top">Entrar con mi cuenta de Mi Mundo</a> : <>
      <form className="profile-form" onSubmit={save}>
        <h2>Tu registro</h2>
        <label>Nombre<input required minLength={2} maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} autoComplete="name" /></label>
        <label>Correo de contacto<input required type="email" maxLength={254} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} autoComplete="email" /></label>
        <label>WhatsApp con código de país<input required type="tel" placeholder="+52 664 123 4567" value={form.whatsapp} onChange={event => setForm({ ...form, whatsapp: event.target.value })} autoComplete="tel" /></label>
        <label className="check-label"><input type="checkbox" checked={form.consent} onChange={event => setForm({ ...form, consent: event.target.checked })} />Quiero recibir avisos sobre mis pujas y resultados por WhatsApp. Puedo solicitar la baja.</label>
        <label className="check-label"><input type="checkbox" required checked={form.accepted} onChange={event => setForm({ ...form, accepted: event.target.checked })} />Acepto el plazo de 24 horas para pagar y el paso al siguiente postor si vence. Esta edición es de prueba.</label>
        <button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar registro'}</button>
      </form>
      <section className="offers-section"><h2>Ofertas de compra</h2>
        <p>Cada obra muestra su propio plazo. El reloj empieza cuando la organización envía las instrucciones de pago.</p>
        {!offers.length && <p className="trial-banner">Al cierre de la subasta aparecerán aquí las obras que te correspondan.</p>}
        {offers.map(offer => {
          const active = offer.status === 'pending' && !!offer.deadline && now < offer.deadline;
          const reference = `HH-${offer.id}`;
          return <article className="offer-card" key={offer.id}>
            <span className="eyebrow">LOTE {offer.lot}</span>
            <h3>{lots.find(lot => lot.id === offer.lot)?.title || `Obra ${offer.lot}`}</h3>
            <strong>{money(offer.amount)} MXN</strong>
            {offer.status === 'ready' && <p>Te corresponde esta obra. La organización está preparando tus instrucciones. Tu plazo de 24 horas todavía no comienza.</p>}
            {active && <>
              <p><strong>Paga antes del {date(offer.deadline!)} · hora de Tijuana.</strong></p>
              <p>Tiempo restante {Math.floor((offer.deadline! - now) / 3600000)} h {Math.floor((offer.deadline! - now) / 60000) % 60} min.</p>
              {offer.mercado_pago_url && <a className="primary" href={offer.mercado_pago_url} target="_blank" rel="noopener noreferrer">Pagar con Mercado Pago ↗</a>}
              {settings.bankAccount && <div className="bank-details"><h4>Transferencia bancaria</h4><p>{settings.bankName} · {settings.beneficiary}</p><p>CLABE <strong>{settings.bankAccount}</strong></p><p>Referencia <strong>{reference}</strong></p><p>Importe exacto {money(offer.amount)} MXN. La organización verificará el abono antes de confirmar tu compra.</p></div>}
              <p className="fine">Usa una sola opción de pago y conserva tu comprobante. Un comprobante pendiente de verificar todavía no confirma la venta.</p>
            </>}
            {(offer.status === 'expired' || (offer.status === 'pending' && !active)) && <p>El plazo de pago venció. Esta solicitud está cerrada y la obra pasa al siguiente postor. Si ya transferiste, contacta a la organización para revisar el abono.</p>}
            {offer.status === 'paid' && <p className="feedback">Pago confirmado. La obra quedó adjudicada a tu cuenta.</p>}
          </article>;
        })}
      </section>
    </>}
    {message && <p className="feedback" role="status">{message}</p>}
  </main>;
}
