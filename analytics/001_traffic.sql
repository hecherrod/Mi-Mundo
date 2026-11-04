-- Anonymous traffic is separate from personal registrations and never stores URLs, email or IP.
create table mi_mundo_private.traffic_events (
 event_id uuid primary key,
 visitor_id uuid not null,
 session_id uuid not null,
 sequence integer not null check(sequence between 1 and 100000),
 section text not null check(section ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
 area text not null default '' check(area in ('','ensenada','todos-santos')),
 kind text not null check(kind in ('pageview','book_form','book_payment')),
 received_at timestamptz not null default clock_timestamp()
);
alter table mi_mundo_private.traffic_events enable row level security;
revoke all on mi_mundo_private.traffic_events from public, anon, authenticated;
grant usage on schema mi_mundo_private to anon, authenticated;
grant insert(event_id,visitor_id,session_id,sequence,section,area,kind) on mi_mundo_private.traffic_events to anon, authenticated;
create policy traffic_insert on mi_mundo_private.traffic_events for insert to anon, authenticated with check(true);
create index traffic_time_idx on mi_mundo_private.traffic_events(received_at);
create index traffic_session_idx on mi_mundo_private.traffic_events(session_id, sequence);

create function public.mi_mundo_track(p_event_id uuid,p_visitor_id uuid,p_session_id uuid,p_sequence integer,p_section text,p_area text,p_kind text)
returns void language sql security invoker set search_path='' as $$
 insert into mi_mundo_private.traffic_events(event_id,visitor_id,session_id,sequence,section,area,kind)
 values(p_event_id,p_visitor_id,p_session_id,p_sequence,p_section,p_area,p_kind)
 on conflict do nothing;
$$;
revoke all on function public.mi_mundo_track(uuid,uuid,uuid,integer,text,text,text) from public;
grant execute on function public.mi_mundo_track(uuid,uuid,uuid,integer,text,text,text) to anon,authenticated;

-- Only the existing general administrator may read aggregate reports.
create function mi_mundo_private.traffic_report(p_days integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.mi_mundo_is_admin() then
  raise exception 'Solo el administrador general puede consultar las estadísticas.' using errcode='42501';
 end if;
 if p_days is null or p_days not between 1 and 365 then raise exception 'Periodo no válido'; end if;
 with events as materialized (
  select * from mi_mundo_private.traffic_events where received_at >= clock_timestamp()-make_interval(days=>p_days)
 ), pages as (select * from events where kind='pageview'),
 ordered as (
  select *, lag(section) over(partition by session_id order by sequence,received_at,event_id) as previous from pages
 ), routes as (
  select session_id, string_agg(section,' → ' order by sequence,received_at,event_id) as route
  from (select * from ordered where previous is distinct from section) x group by session_id
 ), paths as (select route,count(*) as sessions from routes group by route order by count(*) desc,route limit 20)
 select jsonb_build_object(
  'days',p_days,
  'started_at',(select min(received_at) from mi_mundo_private.traffic_events),
  'total', (select jsonb_build_object('views',count(*),'visitors',count(distinct visitor_id),'sessions',count(distinct session_id)) from pages),
  'sections',coalesce((select jsonb_agg(to_jsonb(s) order by s.views desc,s.section) from (
   select section,count(*) as views,count(distinct visitor_id) as visitors,count(distinct session_id) as sessions from pages group by section
  ) s),'[]'::jsonb),
  'leagues',coalesce((select jsonb_agg(to_jsonb(s)) from (
   select area,count(*) as views,count(distinct visitor_id) as visitors from pages where section='domino' and area<>'' group by area
  ) s),'[]'::jsonb),
  'routes',coalesce((select jsonb_agg(to_jsonb(paths)) from paths),'[]'::jsonb),
  'actions',(select jsonb_build_object('book_form',count(*) filter(where kind='book_form'),'book_payment',count(*) filter(where kind='book_payment')) from events),
  'registrations',jsonb_build_object(
   'accounts',(select count(*) from auth.users where not coalesce(is_anonymous,false)),
   'confirmed',(select count(*) from auth.users where email_confirmed_at is not null and not coalesce(is_anonymous,false)),
   'auction',(select count(*) from mi_mundo_private.auction_participants),
   'domino',(select count(distinct user_id) from mi_mundo_private.domino_usernames),
   'domino_leagues',coalesce((select jsonb_agg(to_jsonb(d)) from (select league,count(distinct user_id) as participants from mi_mundo_private.domino_usernames group by league) d),'[]'::jsonb)
  )
 ) into result;
 return result;
end;
$$;
revoke all on function mi_mundo_private.traffic_report(integer) from public,anon;
grant execute on function mi_mundo_private.traffic_report(integer) to authenticated;
create function public.mi_mundo_traffic_report(p_days integer default 30)
returns jsonb language sql security invoker set search_path='' as $$
 select mi_mundo_private.traffic_report(p_days);
$$;
revoke all on function public.mi_mundo_traffic_report(integer) from public,anon;
grant execute on function public.mi_mundo_traffic_report(integer) to authenticated;
