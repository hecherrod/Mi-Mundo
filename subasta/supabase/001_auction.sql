begin;

create schema if not exists mi_mundo_private;
revoke all on schema mi_mundo_private from public, anon, authenticated;

create table mi_mundo_private.auction_rounds (
  id text primary key,
  title text not null,
  closes_at timestamptz not null,
  is_trial boolean not null default true,
  bank_name text not null default '',
  bank_clabe text not null default '',
  bank_beneficiary text not null default ''
);
create table mi_mundo_private.auction_lots (
  round_id text not null references mi_mundo_private.auction_rounds(id),
  id integer not null,
  details jsonb not null,
  primary key (round_id, id)
);
create table mi_mundo_private.auction_participants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  whatsapp text not null,
  whatsapp_consent boolean not null default false,
  accepted_at timestamptz not null default clock_timestamp()
);
create table mi_mundo_private.auction_bids (
  id uuid primary key default gen_random_uuid(),
  round_id text not null,
  lot integer not null,
  user_id uuid not null references auth.users(id),
  amount integer not null check (amount > 0 and amount <= 100000000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (round_id, lot) references mi_mundo_private.auction_lots(round_id, id)
);
create index auction_bids_ranking on mi_mundo_private.auction_bids(round_id, lot, amount desc, created_at, id);
create index auction_bids_user on mi_mundo_private.auction_bids(user_id, round_id, lot);
create table mi_mundo_private.auction_offers (
  id uuid primary key default gen_random_uuid(),
  round_id text not null,
  lot integer not null,
  user_id uuid not null references auth.users(id),
  amount integer not null check (amount > 0),
  status text not null check (status in ('ready','pending','paid','expired')),
  created_at timestamptz not null default clock_timestamp(),
  notified_at timestamptz,
  deadline timestamptz,
  paid_at timestamptz,
  payment_reference text,
  mercado_pago_url text,
  link_disabled_at timestamptz,
  foreign key (round_id, lot) references mi_mundo_private.auction_lots(round_id, id),
  unique (round_id, lot, user_id)
);
create unique index auction_one_current_offer on mi_mundo_private.auction_offers(round_id, lot)
  where status in ('ready','pending','paid');
create index auction_offer_deadlines on mi_mundo_private.auction_offers(deadline) where status='pending';
create index auction_offers_user on mi_mundo_private.auction_offers(user_id, round_id);

alter table mi_mundo_private.auction_rounds enable row level security;
alter table mi_mundo_private.auction_lots enable row level security;
alter table mi_mundo_private.auction_participants enable row level security;
alter table mi_mundo_private.auction_bids enable row level security;
alter table mi_mundo_private.auction_offers enable row level security;
revoke all on mi_mundo_private.auction_rounds, mi_mundo_private.auction_lots,
  mi_mundo_private.auction_participants, mi_mundo_private.auction_bids,
  mi_mundo_private.auction_offers from public, anon, authenticated;

create function mi_mundo_private.auction_advance()
returns void language plpgsql security definer set search_path='' as $$
declare
  v_round mi_mundo_private.auction_rounds;
  v_lot record;
  v_now timestamptz;
begin
  for v_round in select * from mi_mundo_private.auction_rounds where closes_at <= clock_timestamp() order by id for update loop
    v_now := clock_timestamp();
    update mi_mundo_private.auction_offers set status='expired'
      where round_id=v_round.id and status='pending' and deadline<=v_now;
    for v_lot in select id from mi_mundo_private.auction_lots where round_id=v_round.id order by id loop
      insert into mi_mundo_private.auction_offers (round_id,lot,user_id,amount,status)
      select v_round.id, v_lot.id, candidate.user_id, candidate.amount, 'ready'
      from (
        select distinct on (user_id) user_id,amount,created_at,id
        from mi_mundo_private.auction_bids
        where round_id=v_round.id and lot=v_lot.id and created_at<v_round.closes_at
        order by user_id,amount desc,created_at,id
      ) candidate
      where not exists (select 1 from mi_mundo_private.auction_offers o
        where o.round_id=v_round.id and o.lot=v_lot.id and o.user_id=candidate.user_id)
      and not exists (select 1 from mi_mundo_private.auction_offers o
        where o.round_id=v_round.id and o.lot=v_lot.id and o.status in ('ready','pending','paid'))
      order by candidate.amount desc,candidate.created_at,candidate.id limit 1
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;
revoke all on function mi_mundo_private.auction_advance() from public,anon,authenticated;

create function mi_mundo_private.auction_offer_json(p_offer mi_mundo_private.auction_offers)
returns jsonb language sql immutable set search_path='' as $$
  select to_jsonb(p_offer) || jsonb_build_object(
    'created_at',(extract(epoch from p_offer.created_at)*1000)::bigint,
    'notified_at',(extract(epoch from p_offer.notified_at)*1000)::bigint,
    'deadline',(extract(epoch from p_offer.deadline)*1000)::bigint,
    'paid_at',(extract(epoch from p_offer.paid_at)*1000)::bigint,
    'link_disabled_at',(extract(epoch from p_offer.link_disabled_at)*1000)::bigint
  );
$$;
revoke all on function mi_mundo_private.auction_offer_json(mi_mundo_private.auction_offers) from public,anon,authenticated;

create function public.mi_mundo_auction(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user auth.users;
  v_round mi_mundo_private.auction_rounds;
  v_offer mi_mundo_private.auction_offers;
  v_lot mi_mundo_private.auction_lots;
  v_admin boolean := false;
  v_now timestamptz;
  v_result jsonb;
  v_mine jsonb;
  v_rows integer;
  v_amount integer;
  v_current integer;
  v_lot_id integer;
  v_name text;
  v_email text;
  v_phone text;
  v_url text;
  v_reference text;
  v_settings jsonb;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' then
    return jsonb_build_object('error','Datos inválidos.','status',400);
  end if;
  select * into v_user from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_user.id is not null then v_admin := public.mi_mundo_is_admin(); end if;
  if p_action<>'catalog' and v_user.id is null then
    return jsonb_build_object('error','Inicia sesión con tu cuenta de Mi Mundo y confirma tu correo.','status',401);
  end if;
  if p_action in ('admin','admin_action') and not v_admin then
    return jsonb_build_object('error','Acceso reservado al administrador general de Mi Mundo.','status',403);
  end if;

  perform mi_mundo_private.auction_advance();
  select * into v_round from mi_mundo_private.auction_rounds where id='muestra-2026' for update;
  if not found then return jsonb_build_object('error','La edición todavía no está disponible.','status',503); end if;
  v_now := clock_timestamp();
  v_settings := jsonb_build_object('bankName',v_round.bank_name,'bankAccount',v_round.bank_clabe,'beneficiary',v_round.bank_beneficiary);

  if p_action='catalog' then
    select coalesce(jsonb_agg(to_jsonb(aggregate_bid)),'[]') into v_result from (
      select lot,max(amount) as amount,count(*) as count from mi_mundo_private.auction_bids where round_id=v_round.id group by lot
    ) aggregate_bid;
    select coalesce(jsonb_agg(to_jsonb(my_bid)),'[]') into v_mine from (
      select lot,max(amount) as amount from mi_mundo_private.auction_bids where round_id=v_round.id and user_id=v_user.id group by lot
    ) my_bid;
    return jsonb_build_object('bids',v_result,'mine',v_mine,'now',(extract(epoch from v_now)*1000)::bigint,
      'profileComplete',exists(select 1 from mi_mundo_private.auction_participants where user_id=v_user.id),
      'isAdmin',v_admin,'user',case when v_user.id is null then null else jsonb_build_object('name',coalesce(v_user.raw_user_meta_data->>'name',v_user.raw_user_meta_data->>'full_name',v_user.raw_user_meta_data->>'domino_username',v_user.email)) end);
  end if;

  if p_action='profile' then
    select jsonb_build_object('name',name,'email',email,'whatsapp',whatsapp,'whatsapp_consent',whatsapp_consent) into v_result
      from mi_mundo_private.auction_participants where user_id=v_user.id;
    return jsonb_build_object('profile',coalesce(v_result,jsonb_build_object(
      'name',coalesce(v_user.raw_user_meta_data->>'name',v_user.raw_user_meta_data->>'full_name',v_user.raw_user_meta_data->>'domino_username',''),
      'email',v_user.email,
      'whatsapp',case when coalesce(v_user.raw_user_meta_data->>'domino_whatsapp','') ~ '^[0-9]{10}$'
        then '+52'||(v_user.raw_user_meta_data->>'domino_whatsapp') else '' end,
      'whatsapp_consent',false)),
      'registered',v_result is not null,'accountEmail',v_user.email);
  end if;

  if p_action='save_profile' then
    v_name := btrim(coalesce(p_data->>'name',''));
    v_email := lower(btrim(coalesce(p_data->>'email','')));
    v_phone := regexp_replace(coalesce(p_data->>'whatsapp',''),'[[:space:]()-]','','g');
    if char_length(v_name) not between 2 and 120 or char_length(v_email)>254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or v_phone !~ '^\+[1-9][0-9]{7,14}$' or p_data->'accepted' is distinct from 'true'::jsonb then
      return jsonb_build_object('error','Completa nombre, correo, WhatsApp con código de país y acepta las condiciones.','status',400);
    end if;
    insert into mi_mundo_private.auction_participants(user_id,name,email,whatsapp,whatsapp_consent)
      values(v_user.id,v_name,v_email,v_phone,coalesce(p_data->'consent'='true'::jsonb,false))
      on conflict(user_id) do update set name=excluded.name,email=excluded.email,whatsapp=excluded.whatsapp,
        whatsapp_consent=excluded.whatsapp_consent,accepted_at=v_now;
    return jsonb_build_object('ok',true);
  end if;

  if p_action='bid' then
    if not exists(select 1 from mi_mundo_private.auction_participants where user_id=v_user.id) then
      return jsonb_build_object('error','Completa tu registro antes de pujar. La participación es sin depósito.','status',409);
    end if;
    if v_now>=v_round.closes_at then return jsonb_build_object('error','Esta subasta ha finalizado.','status',409); end if;
    if jsonb_typeof(p_data->'amount') is distinct from 'number' or p_data->>'amount' !~ '^[0-9]+$'
      or (p_data->>'amount')::numeric>100000000 or p_data->>'lot' !~ '^[0-9]+$' then
      return jsonb_build_object('error','Ingresa una puja válida en pesos mexicanos.','status',400);
    end if;
    v_amount := (p_data->>'amount')::integer;
    v_lot_id := (p_data->>'lot')::integer;
    select * into v_lot from mi_mundo_private.auction_lots where round_id=v_round.id and id=v_lot_id;
    if not found then return jsonb_build_object('error','Obra no encontrada.','status',404); end if;
    select coalesce(max(amount),(v_lot.details->>'base')::integer) into v_current from mi_mundo_private.auction_bids where round_id=v_round.id and lot=v_lot_id;
    if v_amount<v_current+500 then return jsonb_build_object('error','La puja cambió. El incremento mínimo es de $500 MXN.','status',409); end if;
    insert into mi_mundo_private.auction_bids(round_id,lot,user_id,amount) values(v_round.id,v_lot_id,v_user.id,v_amount);
    return jsonb_build_object('ok',true);
  end if;

  if p_action in ('offers','admin') then
    select coalesce(jsonb_agg(mi_mundo_private.auction_offer_json(o) ||
      case when p_action='admin' then jsonb_build_object('name',p.name,'email',p.email,'whatsapp',p.whatsapp,'whatsapp_consent',p.whatsapp_consent)
      else jsonb_build_object('mercado_pago_url',case when o.status='pending' and o.deadline>v_now then o.mercado_pago_url else null end) end
      order by o.lot,o.created_at desc),'[]') into v_result
    from mi_mundo_private.auction_offers o left join mi_mundo_private.auction_participants p on p.user_id=o.user_id
    where o.round_id=v_round.id and (p_action='admin' or o.user_id=v_user.id);
    return jsonb_build_object('offers',v_result,'paymentSettings',v_settings,'now',(extract(epoch from v_now)*1000)::bigint,'closes',(extract(epoch from v_round.closes_at)*1000)::bigint,'mode',case when v_round.is_trial then 'trial' else 'live' end);
  end if;

  if p_action='admin_action' then
    if p_data->>'action'='settings' then
      if coalesce(p_data->>'bankAccount','') !~ '^([0-9]{18})?$' or char_length(coalesce(p_data->>'beneficiary',''))>160
        or char_length(coalesce(p_data->>'bankName',''))>80 then
        return jsonb_build_object('error','Revisa los datos bancarios. La CLABE debe tener 18 dígitos.','status',400);
      end if;
      update mi_mundo_private.auction_rounds set bank_name=btrim(coalesce(p_data->>'bankName','')),
        bank_clabe=btrim(coalesce(p_data->>'bankAccount','')),bank_beneficiary=btrim(coalesce(p_data->>'beneficiary','')) where id=v_round.id;
      return jsonb_build_object('ok',true);
    end if;
    select * into v_offer from mi_mundo_private.auction_offers where id=(p_data->>'id')::uuid and round_id=v_round.id for update;
    if not found then return jsonb_build_object('error','Oferta no encontrada.','status',404); end if;
    if p_data->>'action'='instructions' then
      if v_offer.status<>'ready' then return jsonb_build_object('error','La oferta ya fue procesada.','status',409); end if;
      v_url := nullif(btrim(coalesce(p_data->>'url','')),'');
      if v_url is not null and (v_url !~ '^https://(mpago\.la|www\.mercadopago\.com\.mx|mercadopago\.com\.mx)/' or char_length(v_url)>2000) then
        return jsonb_build_object('error','Usa un enlace HTTPS válido de Mercado Pago México.','status',400);
      end if;
      update mi_mundo_private.auction_offers set mercado_pago_url=v_url where id=v_offer.id;
      return jsonb_build_object('ok',true);
    end if;
    if p_data->>'confirmed' is distinct from 'true' then return jsonb_build_object('error','Confirma la acción antes de continuar.','status',400); end if;
    if p_data->>'action'='disable-link' and v_offer.status='expired' then
      update mi_mundo_private.auction_offers set link_disabled_at=v_now where id=v_offer.id;
      return jsonb_build_object('ok',true);
    end if;
    if p_data->>'action'='notify' and v_offer.status='ready' then
      if v_offer.mercado_pago_url is null and (v_round.bank_clabe='' or v_round.bank_beneficiary='') then
        return jsonb_build_object('error','Configura Mercado Pago o los datos de transferencia antes de enviar el aviso.','status',409);
      end if;
      if exists(select 1 from mi_mundo_private.auction_offers where round_id=v_round.id and lot=v_offer.lot and status='expired' and mercado_pago_url is not null and link_disabled_at is null) then
        return jsonb_build_object('error','Desactiva el enlace anterior de Mercado Pago y regístralo antes de avisar al siguiente postor.','status',409);
      end if;
      update mi_mundo_private.auction_offers set status='pending',notified_at=v_now,deadline=v_now+interval '24 hours' where id=v_offer.id;
      return jsonb_build_object('ok',true);
    end if;
    if p_data->>'action'='paid' and v_offer.status='pending' and v_offer.deadline>v_now then
      v_reference := btrim(coalesce(p_data->>'reference',''));
      if char_length(v_reference) not between 3 and 200 then return jsonb_build_object('error','Indica la referencia del abono verificado.','status',400); end if;
      update mi_mundo_private.auction_offers set status='paid',paid_at=v_now,payment_reference=v_reference where id=v_offer.id;
      return jsonb_build_object('ok',true);
    end if;
    return jsonb_build_object('error','La oferta cambió o el plazo venció. Revisa los pagos tardíos antes de devolverlos.','status',409);
  end if;
  return jsonb_build_object('error','Operación no disponible.','status',400);
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation then
  return jsonb_build_object('error','Revisa los datos enviados.','status',400);
end;
$$;
revoke all on function public.mi_mundo_auction(text,jsonb) from public,anon,authenticated;
grant execute on function public.mi_mundo_auction(text,jsonb) to anon,authenticated;

commit;
