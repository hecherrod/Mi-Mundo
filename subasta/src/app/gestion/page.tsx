'use client';
import { auctionRequest } from '../../lib/client-api';
import { useEffect, useState } from 'react';
import { lots } from '../../lib/catalog';
import type { Offer } from '../../lib/types';

type AdminOffer = Offer & { name?: string; email?: string; whatsapp?: string; whatsapp_consent?: number };
type Settings = { bankName: string; bankAccount: string; beneficiary: string };
const money = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value);
const date = (value: number) => new Date(value).toLocaleString('es-MX', { timeZone: 'America/Tijuana', dateStyle: 'medium', timeStyle: 'short' });

function OfferControls({ offer, settings, onChange }: { offer: AdminOffer; settings: Settings; onChange: () => Promise<void> }) {
  const [url, setUrl] = useState(offer.mercado_pago_url || '');
  const [reference, setReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = lots.find(lot => lot.id === offer.lot)?.title || `Lote ${offer.lot}`;
  const referenceCode = `HH-${offer.id}`;
  const paymentText = offer.mercado_pago_url ? `Mercado Pago: ${offer.mercado_pago_url}. ` : '';
  const transferText = settings.bankAccount ? `Transferencia a ${settings.bankName}, beneficiario ${settings.beneficiary}, CLABE ${settings.bankAccount}. Referencia ${referenceCode}. ` : '';
  const message = `Hola ${offer.name || ''}. Te ofrecemos la obra ${title}, lote ${offer.lot}, por tu puja de ${money(offer.amount)} MXN. Tienes 24 horas a partir de este aviso para pagar. ${paymentText}${transferText}Si vence el plazo sin pago confirmado, la obra se ofrece al siguiente postor. Consulta tu plazo exacto en Mi cuenta. Edición de prueba.`;

  async function action(name: string) {
    setBusy(true);
    setError('');
    try {
      const response = await auctionRequest('/api/auction/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, id: offer.id, url, reference, confirmed }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la oferta.');
      setConfirmed(false);
      await onChange();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <article className="offer-card">
    <span className="eyebrow">LOTE {offer.lot} · {offer.status === 'ready' ? 'POR AVISAR' : offer.status === 'pending' ? 'ESPERANDO PAGO' : offer.status === 'paid' ? 'PAGADO' : 'VENCIDO'}</span>
    <h3>{title}</h3><strong>{money(offer.amount)} MXN</strong>
    <p>{offer.name || 'Participante anterior al registro de contacto'} · {offer.email || 'Correo pendiente'} · {offer.whatsapp || 'WhatsApp pendiente'}</p>
    {offer.deadline && <p>Vencimiento {date(offer.deadline)} · Tijuana</p>}
    <p className="fine">Referencia {referenceCode}</p>
    {offer.status === 'ready' && <>
      <label>Enlace exclusivo de Mercado Pago para esta oferta<input type="url" placeholder="https://mpago.la/…" value={url} onChange={event => setUrl(event.target.value)} /></label>
      <button className="outline" disabled={busy} onClick={() => action('instructions')}>Guardar enlace</button>
      <p className="fine">El enlace debe tener el importe correcto y poder desactivarse si vence la oferta. Para transferencia, configura los datos bancarios antes de enviar el aviso.</p>
      <div className="notice-actions">
        {offer.email && <a className="outline" href={`mailto:${encodeURIComponent(offer.email)}?subject=${encodeURIComponent('Tu obra en la subasta · 24 horas para pagar')}&body=${encodeURIComponent(message)}`}>Preparar correo ↗</a>}
        {!!offer.whatsapp_consent && offer.whatsapp && <a className="outline" href={`https://wa.me/${offer.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Preparar WhatsApp ↗</a>}
      </div>
      <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Confirmo que ya envié las instrucciones al participante. Al confirmar empieza su plazo de 24 horas.</label>
      <button className="primary" disabled={busy || !confirmed} onClick={() => action('notify')}>Registrar aviso y empezar 24 horas</button>
    </>}
    {offer.status === 'pending' && <>
      <label>Referencia del abono verificado<input value={reference} onChange={event => setReference(event.target.value)} maxLength={200} /></label>
      <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Verifiqué en Mercado Pago o en el banco que el abono completo está acreditado.</label>
      <button className="primary" disabled={busy || !confirmed || reference.trim().length < 3} onClick={() => action('paid')}>Confirmar pago acreditado</button>
    </>}
    {offer.status === 'expired' && offer.mercado_pago_url && !offer.link_disabled_at && <>
      <p className="error">Desactiva el enlace vencido en Mercado Pago antes de avisar al siguiente postor.</p>
      <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Ya desactivé este enlace en Mercado Pago.</label>
      <button className="outline" disabled={busy || !confirmed} onClick={() => action('disable-link')}>Registrar desactivación</button>
    </>}
    {error && <p role="alert" className="error">{error}</p>}
  </article>;
}

export default function Management() {
  const [offers, setOffers] = useState<AdminOffer[]>([]);
  const [settings, setSettings] = useState<Settings>({ bankName: '', bankAccount: '', beneficiary: '' });
  const [message, setMessage] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [bankMessage, setBankMessage] = useState('');
  const [bankDraft, setBankDraft] = useState<Settings | null>(null);

  async function saveBank(event: React.FormEvent) {
    event.preventDefault();
    setBankMessage('Guardando…');
    try {
      const response = await auctionRequest('/api/auction/admin', { method: 'POST', body: JSON.stringify({ action: 'settings', ...(bankDraft || settings) }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'No se pudieron guardar los datos.');
      setSettings(bankDraft || settings);
      setBankDraft(null);
      setBankMessage('Datos bancarios guardados.');
    } catch (error) { setBankMessage((error as Error).message); }
  }

  async function refresh() {
    try {
      const response = await auctionRequest('/api/auction/admin');
      const data = await response.json() as { offers: AdminOffer[]; paymentSettings: Settings; error?: string };
      if (!response.ok) { setAuthorized(false); throw new Error(data.error); }
      setAuthorized(true);
      setOffers(data.offers);
      setSettings(data.paymentSettings);
      setMessage('');
    } catch (error) { setMessage((error as Error).message); }
  }
  useEffect(() => { refresh(); const poll = setInterval(refresh, 15000); return () => clearInterval(poll); }, []);

  return <main className="account-page">
    <a className="back-link" href="/subasta/">← Volver al catálogo</a>
    <span className="eyebrow">ORGANIZACIÓN</span><h1>Cierre y pagos</h1>
    <p>Participación sin depósito. Cada ganador tiene 24 horas desde el envío del aviso. Las ofertas vencidas pasan al siguiente participante por su propia puja más alta. Una persona se considera una sola vez por obra.</p>
    <p className="trial-banner">Primera versión con avisos y comprobación de abonos a cargo de la organización. Este panel prepara los mensajes y registra el plazo. La mensajería y la confirmación automática de Mercado Pago requieren conectar sus servicios.</p>
    {message && <p className="error" role="alert">{message}</p>}
    {authorized && <>
      <form className="profile-form" onSubmit={saveBank}>
        <h2>Transferencias de esta edición</h2>
        <label>Banco<input maxLength={80} value={bankDraft?.bankName ?? settings.bankName} onChange={event => setBankDraft({ ...settings, ...bankDraft, bankName: event.target.value })} /></label>
        <label>CLABE de 18 dígitos<input inputMode="numeric" pattern="[0-9]{18}" value={bankDraft?.bankAccount ?? settings.bankAccount} onChange={event => setBankDraft({ ...settings, ...bankDraft, bankAccount: event.target.value })} /></label>
        <label>Beneficiario<input maxLength={160} value={bankDraft?.beneficiary ?? settings.beneficiary} onChange={event => setBankDraft({ ...settings, ...bankDraft, beneficiary: event.target.value })} /></label>
        <button className="primary">Guardar datos bancarios</button>
        {bankMessage && <p role="status">{bankMessage}</p>}
      </form>
      <button className="outline" onClick={refresh}>Actualizar resultados</button>
      {!settings.bankAccount && <p className="trial-banner">Transferencias pendientes de configurar. Se necesitan banco, CLABE y nombre del beneficiario.</p>}
      {!offers.length && <p className="trial-banner">Las ofertas aparecerán al cierre de los lotes con pujas. Las obras sin postores quedan sin adjudicar.</p>}
      {offers.map(offer => <OfferControls key={`${offer.id}-${offer.status}-${offer.mercado_pago_url}-${offer.link_disabled_at}`} offer={offer} settings={settings} onChange={refresh} />)}
    </>}
  </main>;
}
