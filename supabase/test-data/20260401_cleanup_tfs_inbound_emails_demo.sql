begin;

delete from public.tfs_inbound_emails
where raw_payload->>'seed_batch' = '2026-04-01-inbound-email-demo'
   or outlook_message_id in (
     'seed-demo-2026-04-01-eastbourne-theft',
     'seed-demo-2026-04-01-poole-theft',
     'seed-demo-2026-04-01-weekly-stock-count-results',
     'seed-demo-2026-04-01-west-bromwich-stocktake-green',
     'seed-demo-2026-04-01-store-tester-order-tracker'
   );

commit;
