begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'mi-mundo-auction-expiry',
  '* * * * *',
  'select mi_mundo_private.auction_advance();'
);
commit;
