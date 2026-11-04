-- Keep anonymous navigation separate from account registrations. Exclude the
-- verified general administrator, using the existing server-side identity check.
create or replace function public.mi_mundo_track(p_event_id uuid,p_visitor_id uuid,p_session_id uuid,p_sequence integer,p_section text,p_area text,p_kind text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null then
  if public.mi_mundo_is_admin() then return; end if;
 end if;
 insert into mi_mundo_private.traffic_events(event_id,visitor_id,session_id,sequence,section,area,kind)
 values(p_event_id,p_visitor_id,p_session_id,p_sequence,p_section,p_area,p_kind)
 on conflict do nothing;
end;
$$;
