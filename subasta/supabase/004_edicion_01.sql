-- Primera edición real: Luna y Cardón floreado (Héctor Herrera, 2022).
-- La primera puja puede ser igual al precio de salida; después sube de $500 en $500.
begin;
insert into mi_mundo_private.auction_rounds(id,title,closes_at,is_trial)
values('edicion-01','Subasta de noviembre · Edición 01','2026-11-23T07:59:00Z',false);
insert into mi_mundo_private.auction_lots(round_id,id,details) values
('edicion-01',1,'{"id":1,"title":"Luna","artist":"Héctor Herrera","year":2022,"type":"Pintura","medium":"Acrílico con aerógrafo sobre madera","size":"150 cm de diámetro","base":2500}'::jsonb),
('edicion-01',2,'{"id":2,"title":"Cardón floreado","artist":"Héctor Herrera","year":2022,"type":"Obra gráfica","medium":"Giclée enmarcado","size":"115 × 115 cm con marco","base":2000}'::jsonb);
commit;
-- En public.mi_mundo_auction:
--   la ronda activa pasa de 'muestra-2026' a 'edicion-01';
--   la validación de la puja queda así:
--     sin pujas previas: monto >= base; con pujas: monto >= actual + 500; siempre (monto - base) múltiplo de 500.
