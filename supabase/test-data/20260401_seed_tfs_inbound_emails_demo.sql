begin;

-- Safe to re-run: remove only this demo batch before re-inserting.
delete from public.tfs_inbound_emails
where outlook_message_id in (
  'seed-demo-2026-04-01-eastbourne-theft',
  'seed-demo-2026-04-01-poole-theft',
  'seed-demo-2026-04-01-weekly-stock-count-results',
  'seed-demo-2026-04-01-west-bromwich-stocktake-green',
  'seed-demo-2026-04-01-store-tester-order-tracker'
);

insert into public.tfs_inbound_emails (
  source,
  outlook_message_id,
  internet_message_id,
  conversation_id,
  mailbox_name,
  folder_name,
  subject,
  sender_name,
  sender_email,
  received_at,
  has_attachments,
  body_preview,
  body_text,
  body_html,
  raw_payload,
  matched_store_id,
  processing_status,
  last_error
)
values
(
  'outlook',
  'seed-demo-2026-04-01-eastbourne-theft',
  '<seed-demo-2026-04-01-eastbourne-theft@tfs.local>',
  'seed-demo-loss-thread-001',
  'TFS Shared Mailbox',
  'Loss Prevention Inbox',
  'Theft in Eastbourne',
  'The Fragrance Shop Eastbourne',
  '261.eastbourne@tfsstores.com',
  '2026-03-31T16:40:00+00:00'::timestamptz,
  false,
  'We''ve had a theft in the Eastbourne store today from our non-lockable FSDU.',
  $$Hello,

We’ve had a theft in the Eastbourne store today from our non-lockable FSDU – the person took 1x Ghost Mini Moons Giftset stock ID 72213.

I’m just adjusting the stock and adding it to our store theft log now, and I’ll also report it to the police. Thank you.

Kind regards,

Leanna Vine
Store Manager
The Fragrance Shop Eastbourne
64 Beacon Centre
Eastbourne
BN21 3NW
T: 01323 340590$$,
  $$<p>Hello,</p>
<p>We’ve had a theft in the Eastbourne store today from our non-lockable FSDU – the person took 1x Ghost Mini Moons Giftset stock ID 72213.</p>
<p>I’m just adjusting the stock and adding it to our store theft log now, and I’ll also report it to the police. Thank you.</p>
<p>Kind regards,<br>Leanna Vine<br>Store Manager<br>The Fragrance Shop Eastbourne</p>$$,
  jsonb_build_object(
    'test_seed', true,
    'seed_batch', '2026-04-01-inbound-email-demo',
    'message_kind', 'store_theft',
    'subject', 'Theft in Eastbourne',
    'receivedDateTime', '2026-03-31T16:40:00+00:00',
    'from', jsonb_build_object(
      'name', 'The Fragrance Shop Eastbourne',
      'address', '261.eastbourne@tfsstores.com'
    ),
    'toRecipients', jsonb_build_array(
      jsonb_build_object('name', 'TFSLossPrevention', 'address', 'tfslossprevention@kssnwltd.co.uk'),
      jsonb_build_object('name', 'TFS Stock Adjustments', 'address', 'stock@tfs.com'),
      jsonb_build_object('name', 'Rebecca Russo', 'address', 'rebecca.russo@tfs.com')
    ),
    'attachments', jsonb_build_array(),
    'store_code_hint', '261',
    'store_name_hint', 'Eastbourne'
  ),
  (select id from public.tfs_stores where store_code = '261' limit 1),
  'pending',
  null
),
(
  'outlook',
  'seed-demo-2026-04-01-poole-theft',
  '<seed-demo-2026-04-01-poole-theft@tfs.local>',
  'seed-demo-loss-thread-002',
  'TFS Shared Mailbox',
  'Loss Prevention Inbox',
  'theft',
  'The Fragrance Shop Poole2',
  '311.poole2@tfsstores.com',
  '2026-03-31T13:27:00+00:00'::timestamptz,
  false,
  'Yesterday we had a theft and the wrong Tom Ford item was taken.',
  $$Good afternoon,

Yesterday we had a theft, a customer paid for tom ford edp but took the wrong one, the tom ford parfum. I have filled out the police report, updated the theft log and stock adjusted.
The product detail:
Unit 1 = 55434 = tom ford ombre leather parfum 50ml

Kind regards,
Remy

The Fragrance Shop
Poole 311
311.Poole2@tfsstores.com
01202 375087$$,
  $$<p>Good afternoon,</p>
<p>Yesterday we had a theft, a customer paid for tom ford edp but took the wrong one, the tom ford parfum. I have filled out the police report, updated the theft log and stock adjusted.</p>
<p>The product detail:<br>Unit 1 = 55434 = tom ford ombre leather parfum 50ml</p>
<p>Kind regards,<br>Remy<br>The Fragrance Shop<br>Poole 311</p>$$,
  jsonb_build_object(
    'test_seed', true,
    'seed_batch', '2026-04-01-inbound-email-demo',
    'message_kind', 'store_theft',
    'subject', 'theft',
    'receivedDateTime', '2026-03-31T13:27:00+00:00',
    'from', jsonb_build_object(
      'name', 'The Fragrance Shop Poole2',
      'address', '311.poole2@tfsstores.com'
    ),
    'toRecipients', jsonb_build_array(
      jsonb_build_object('name', 'Claire Christopherson', 'address', 'claire.christopherson@tfs.com'),
      jsonb_build_object('name', 'TFSLossPrevention', 'address', 'tfslossprevention@kssnwltd.co.uk'),
      jsonb_build_object('name', 'TFS Stock Adjustments', 'address', 'stock@tfs.com')
    ),
    'ccRecipients', jsonb_build_array(
      jsonb_build_object('name', 'Louise Cheney', 'address', 'louise.cheney@tfs.com')
    ),
    'attachments', jsonb_build_array(),
    'store_code_hint', '311',
    'store_name_hint', 'Poole 2'
  ),
  (select id from public.tfs_stores where store_code = '311' limit 1),
  'pending',
  null
),
(
  'outlook',
  'seed-demo-2026-04-01-weekly-stock-count-results',
  '<seed-demo-2026-04-01-weekly-stock-count-results@tfs.local>',
  'seed-demo-stock-thread-001',
  'TFS Shared Mailbox',
  'Stock Control Inbox',
  'Weekly Stock Count Results - W/C 30 March 2026',
  'Claire Christopherson',
  'claire.christopherson@tfs.com',
  '2026-03-31T13:14:00+00:00'::timestamptz,
  true,
  'Weekly stock count tracker attached. Main concern stores include Dundrum, Belfast, Northampton, Boscombe, Canary Wharf, and Newcastle Upon Tyne.',
  $$Please find attached the weekly stock count results for the week commencing 30 March 2026.

This weeks top concern stores:
- 571 Dundrum
- 372 Belfast
- 275 Northampton
- 99 Boscombe
- 392 Canary Wharf
- 209 Newcastle Upon Tyne

The report explains weekly count sums, missing stock over the last 6 weeks, year on year sales concern, August stocktake results, March stocktake results, and upcoming stocktake dates.

Attachment: Weekly Stock Count Tracker.xlsx$$,
  $$<h1>This Weeks Top Concern Stores</h1>
<p>Please find attached the weekly stock count tracker.</p>
<ul>
  <li>571 Dundrum</li>
  <li>372 Belfast</li>
  <li>275 Northampton</li>
  <li>99 Boscombe</li>
  <li>392 Canary Wharf</li>
  <li>209 Newcastle Upon Tyne</li>
</ul>
<p>The attachment includes weekly counts, missing stock trends, year on year sales indicators, and stocktake completion information.</p>$$,
  jsonb_build_object(
    'test_seed', true,
    'seed_batch', '2026-04-01-inbound-email-demo',
    'message_kind', 'weekly_stock_count_results',
    'subject', 'Weekly Stock Count Results - W/C 30 March 2026',
    'receivedDateTime', '2026-03-31T13:14:00+00:00',
    'from', jsonb_build_object(
      'name', 'Claire Christopherson',
      'address', 'claire.christopherson@tfs.com'
    ),
    'attachments', jsonb_build_array(
      jsonb_build_object(
        'name', 'Weekly Stock Count Tracker.xlsx',
        'contentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'size', 772000
      )
    ),
    'mentioned_store_codes', jsonb_build_array('571', '372', '275', '99', '392', '209'),
    'mentioned_store_names', jsonb_build_array(
      'Dundrum',
      'Belfast',
      'Northampton',
      'Boscombe',
      'Canary Wharf',
      'Newcastle Upon Tyne'
    )
  ),
  null,
  'pending',
  null
),
(
  'outlook',
  'seed-demo-2026-04-01-west-bromwich-stocktake-green',
  '<seed-demo-2026-04-01-west-bromwich-stocktake-green@tfs.local>',
  'seed-demo-stock-thread-002',
  'TFS Shared Mailbox',
  'Stock Control Inbox',
  '220 West Bromwich Stocktake Result - Green',
  'Claire Christopherson',
  'claire.christopherson@tfs.com',
  '2026-03-31T09:30:00+00:00'::timestamptz,
  false,
  'Your stocktake result is profit £18, 0.00%, Green.',
  $$Your Stocktake Result is:

Profit £18
0.00%
GREEN

Amazing result, well done – thank you for all your hard work to achieve this!

Please note – Stocktake % Results have changed to:
Green < 0.35%
Amber < 0.60%
Red

Important information:
- Check all deliveries thoroughly, report any discrepancies to warehouseadmin@tfs.com and stock@tfs.com
- Report all thefts to the Police, Loss Prevention, your AM and stock@tfs.com
- Adjust stolen stock on the workbench as theft
- Review FSDU placement and reduce clearance table exposure for high value stock

Thank you,
Claire Christopherson
Stock Control Manager$$,
  $$<p>Your Stocktake Result is:</p>
<p><strong>Profit £18</strong><br><strong>0.00%</strong><br><span style="color:#008000"><strong>GREEN</strong></span></p>
<p>Amazing result, well done – thank you for all your hard work to achieve this!</p>
<p>Please note – Stocktake % Results have changed to Green &lt; 0.35% &lt; Amber &lt; 0.60% &lt; Red.</p>
<p>Important information covers deliveries, theft reporting, stock adjustments, and reducing external theft risk.</p>$$,
  jsonb_build_object(
    'test_seed', true,
    'seed_batch', '2026-04-01-inbound-email-demo',
    'message_kind', 'stocktake_result',
    'subject', '220 West Bromwich Stocktake Result - Green',
    'receivedDateTime', '2026-03-31T09:30:00+00:00',
    'from', jsonb_build_object(
      'name', 'Claire Christopherson',
      'address', 'claire.christopherson@tfs.com'
    ),
    'attachments', jsonb_build_array(),
    'stocktake_result', jsonb_build_object(
      'store_code', '220',
      'store_name', 'West Bromwich',
      'colour', 'green',
      'profit_gbp', 18,
      'variance_pct', 0.00
    ),
    'store_code_hint', '220',
    'store_name_hint', 'West Bromwich'
  ),
  (select id from public.tfs_stores where store_code = '220' limit 1),
  'pending',
  null
),
(
  'outlook',
  'seed-demo-2026-04-01-store-tester-order-tracker',
  '<seed-demo-2026-04-01-store-tester-order-tracker@tfs.local>',
  'seed-demo-stock-thread-003',
  'TFS Shared Mailbox',
  'Stock Control Inbox',
  'Store Tester Order Tracker - Week 52',
  'Claire Christopherson',
  'claire.christopherson@tfs.com',
  '2026-03-29T19:21:00+00:00'::timestamptz,
  true,
  'Store tester order tracker attached. Highlighted stores include Warrington, Clacton Outlet, and Reading.',
  $$Hi All,

Please find attached the Store Tester Order Tracker.

This shows how many testers have been ordered by each store last week. Quantities will vary based on stock availability, store grade, thefts, and other operational factors.

Please can you look at the following stores:
- 089 Warrington — Ordering every week
- 937 Clacton Outlet — Ordering every week
- 211 Reading — High levels ordered for size of store

Please use this as another loss prevention tool, and keep an eye on any stores ordering high volumes of testers on a weekly basis.

Thank you,
Claire Christopherson
Stock Control Manager$$,
  $$<p>Hi All,</p>
<p>Please find attached the Store Tester Order Tracker.</p>
<p>Please can you look at the following stores:</p>
<ul>
  <li>089 Warrington — Ordering every week</li>
  <li>937 Clacton Outlet — Ordering every week</li>
  <li>211 Reading — High levels ordered for size of store</li>
</ul>
<p>Please use this as another loss prevention tool, and keep an eye on stores ordering high volumes of testers.</p>$$,
  jsonb_build_object(
    'test_seed', true,
    'seed_batch', '2026-04-01-inbound-email-demo',
    'message_kind', 'tester_order_tracker',
    'subject', 'Store Tester Order Tracker - Week 52',
    'receivedDateTime', '2026-03-29T19:21:00+00:00',
    'from', jsonb_build_object(
      'name', 'Claire Christopherson',
      'address', 'claire.christopherson@tfs.com'
    ),
    'attachments', jsonb_build_array(
      jsonb_build_object(
        'name', 'FY26 Week 52 - Store Tester Order Tracker.xlsx',
        'contentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'size', 3000000
      )
    ),
    'mentioned_store_codes', jsonb_build_array('089', '937', '211'),
    'mentioned_store_names', jsonb_build_array('Warrington', 'Clacton Outlet', 'Reading'),
    'normalized_store_code_hints', jsonb_build_array('89', '937', '211')
  ),
  null,
  'pending',
  null
);

commit;

-- Cleanup later with:
-- delete from public.tfs_inbound_emails
-- where raw_payload->>'seed_batch' = '2026-04-01-inbound-email-demo';
