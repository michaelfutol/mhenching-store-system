# Mhenching Store System Milestones

This file is the working checklist for keeping the MVP focused. Do not start a later milestone until the active milestone is verified, unless the user explicitly changes priority.

## Product Direction

One connected store system with three interfaces:

- Mobile POS for attendants: scan barcodes, input quantities, and checkout.
- Attendant access: staff log in with assigned email/password accounts so sales, live carts, and table bills are attributed by attendant.
- Web Admin Dashboard for management: maintain pricing, markups, costs, stock, and EOD profit reports.
- Mobile Admin Capture for management: use the phone back camera to scan product barcodes and take item photos while adding inventory records.
- Restobar operations: support running bills by table, group, or customer tab before final payment.
- Omnichannel ordering: prepare one order engine for POS, web ordering, delivery, Facebook/TikTok-assisted orders, and later marketplace integrations.
- Accounts Receivable / Utang Ledger: track approved credit sales with customer names, promised payment dates, balances, and settlement history.
- Business Analytics / AI Advisor Briefs: generate EOD and weekly structured reports from sales, inventory, expiry, margin, and receivables data for copy/paste review with outside AI advisors.

Supabase is the shared backend for all interfaces.

## Build Path

Build in this order so the store can keep operating while the system expands:

1. Stabilize the current store POS/admin MVP.
2. Fix live same-day sales visibility so open transactions appear before Close Day while EOD remains closed-only.
3. Add the Inventory Intelligence data foundation before expanding inventory code further.
4. Add EOD and weekly analytics reports using deterministic SQL/dashboard calculations.
5. Add a structured AI Advisor Brief export that can be copied into outside AI advisors before considering a resident LLM.
6. Validate the Android APK on real store phones.
7. Add restobar running bills for tables, groups, and customer tabs.
8. Add live attendant POS monitoring and manager-approved void controls.
9. Add payment records, mixed payments, and the Accounts Receivable / Utang Ledger.
10. Add website ordering and delivery workflow.
11. Add social channel intake for Facebook/TikTok orders, starting with manual staff entry and later API/webhook automation where supported.
12. Harden auth, RLS, audit logs, backups, and production deployment.

## Milestone 0: Baseline And Repository Control

- [x] Repository connected to `michaelfutol/mhenching-store-system`.
- [x] Latest branch pulled before active work.
- [x] Existing Supabase schema reviewed.
- [x] Existing Next.js, Tailwind, and Capacitor setup reviewed.
- [ ] Commit current completed admin dashboard work after final review.

Exit criteria:

- Working tree only contains intentional project changes.
- `npm run lint` passes.
- `npm run build` passes.

## Milestone 1: Backend Data Contract

- [x] `products` table supports SKU/barcode, name, cost, markup, retail price, stock, and pack multiplier.
- [x] `transactions` and `transaction_items` support checkout and historical COGS via `unit_cost_at_sale`.
- [x] `process_checkout` RPC handles server-side stock decrement and sale item creation.
- [x] Add product photo support to the data contract.
- [x] Add Supabase Storage bucket plan for product images.
- [x] Confirm public Data API grants and RLS policy posture for MVP operations.
- [x] Enable Supabase Realtime for every table the UI expects to live-refresh.

Recommended product photo approach:

- Add `image_url TEXT` or `image_path TEXT` to `products`.
- Use one Supabase Storage bucket for product photos.
- Store the object path in `products.image_path`; generate public or signed URLs based on the final security model.

Exit criteria:

- Schema changes are documented in SQL.
- Web and mobile clients can read the same product record shape.
- Product images have a clear storage and retrieval path.

## Milestone 2: Web Admin Dashboard

- [x] Product management form supports custom SKUs such as `LOMI-BIG` and `MARL-PCS`.
- [x] Product form supports name, unit cost, markup rate, retail price, stock count, and pack multiplier.
- [x] Product writes map to `products` schema fields.
- [x] EOD view aggregates closed transactions for today.
- [x] EOD view calculates Gross Revenue, historical COGS, and Net Profit.
- [x] Close Day marks open transactions closed and exports the refreshed report.
- [x] Show product image preview once photo support lands.

Exit criteria:

- Management can add/edit inventory from desktop.
- EOD profit numbers use `transaction_items.unit_cost_at_sale`, not current product cost.
- Dashboard remains management-focused, not attendant checkout-focused.

## Milestone 2A: Live Sales And Open Transaction Visibility

This is the immediate dashboard correction discovered during Lomi test sales: inventory decrements immediately, but sales stay out of EOD until `closed = true`.

- [x] Add a Live Sales Today view that aggregates today's transactions regardless of `closed` status.
- [x] Keep EOD Summary as closed-only so final reports remain locked after Close Day.
- [x] Show open transaction count, closed transaction count, live gross revenue, live COGS, and live profit.
- [x] Make the item breakdown label clear: Live Today vs Closed EOD.
- [x] Ensure Close Day refreshes both live and closed summaries after updating transactions.

Exit criteria:

- Management can see today's sales before pressing Close Day.
- EOD reports still use only closed transactions.
- The earlier test case of two `LOMI-BIG` orders would show live revenue, COGS, and profit before closing the day.

## Milestone 2B: Inventory Intelligence Data Foundation

Add the fields and tables needed for analytics before the inventory UI grows further.

- [ ] Add product classification fields: category, department, supplier, taxable/service type later, and shelf status.
- [ ] Add perishable controls: `is_perishable`, default shelf life, expiry required flag, and storage notes where needed.
- [ ] Add stock threshold controls: reorder point, target stock, minimum display stock, and low-stock alert settings.
- [ ] Add margin controls: target markup, minimum acceptable margin, and manager note for exceptions.
- [ ] Add stock lot or batch tracking for FIFO and expiry-sensitive items.
- [ ] Add stock movement ledger for purchases, sales, voids, waste/spoilage, adjustments, and returns.
- [ ] Preserve historical COGS by sale item and by stock lot where available.
- [ ] Add simple supplier/source fields so weekly reports can identify bad supply costs or frequent stockouts.
- [ ] Keep product creation simple for non-perishable retail items; expiry and batch fields should be optional unless the product requires them.
- [x] Add initial product-level received date, expiry date, batch number, perishable flag, and reorder point fields.
- [x] Add Web Admin controls for initial product-level expiry, received date, batch, perishable flag, and reorder point.
- [x] Add Mobile Admin Capture controls for initial product-level expiry, received date, batch, perishable flag, and reorder point.

Recommended data shape:

- `product_categories`: food, drinks, cigarettes, grocery, supplies, and future custom categories.
- `suppliers`: vendor/source name, contact, notes, active flag.
- `stock_lots`: product, received date, optional expiry date, quantity received, quantity remaining, unit cost, supplier, batch/reference code.
- `stock_movements`: product, optional lot, quantity change, movement type, reference record, reason, attendant/admin, timestamp.
- Product-level flags: perishable, expiry required, reorder point, target stock, shelf status, target margin.

Exit criteria:

- Management can record expiry dates for perishable or applicable items.
- The system can support FIFO recommendations without guessing from current stock alone.
- Slow-moving, expiring, and reorder reports have clean source data.

## Milestone 2C: EOD And Weekly Business Analytics Reports

Start with deterministic reports from Supabase data before adding AI. These reports must be useful even if no LLM API is connected.

- [ ] EOD report: gross sales, COGS, profit, open transactions, closed transactions, payment mix, and receivables created.
- [x] Add Admin daily, weekly, and monthly sales report tabs with historical date selection.
- [x] Show compounded revenue, COGS, profit, transaction count, item sales, and attendant sales for selected day/week/month.
- [x] Best sellers vs inventory: top-selling items with remaining stock and reorder risk.
- [ ] Profit leaders: items contributing the most gross profit.
- [ ] Low-margin warnings: items selling often but earning too little.
- [ ] Slow-moving items: items with stock but weak or zero sales over the chosen period.
- [ ] Shelf removal candidates: slow-moving items with low margin, expiry risk, or repeated waste.
- [ ] FIFO and expiry watchlist: lots nearing expiry and lots that should sell first.
- [x] Stockout risk: fast movers below reorder point or target stock.
- [ ] Waste/spoilage report: expired, damaged, or manually written-off items.
- [ ] Attendant/channel performance: POS, restobar, website, Facebook/TikTok/manual source once channels exist.
- [ ] Utang/receivables report: due today, overdue, promised dates, partial payments, and remaining balances.
- [ ] Weekly strategy report: what to restock, reprice, bundle, promote, reduce, or remove.
- [x] Add initial Top 10 Analytics Report placeholder cards from live sales and current inventory.
- [x] Add Top 10 fast-moving replenishment plan with suggested buy quantity and estimated capital needed.

Top 10 daily management report cards:

1. Sales and net profit today.
2. Best-selling items vs remaining inventory.
3. Highest-profit items.
4. Low-margin/high-volume items.
5. Low-stock and likely stockout items.
6. Slow-moving inventory.
7. Expiring or FIFO-priority items.
8. Waste/spoilage/adjustment losses.
9. Payment mix including cash, GCash, card later, USDT later, and utang.
10. Overdue and due-today utang balances.

Exit criteria:

- Management can review the top 10 report cards after Close Day.
- Weekly review shows concrete actions, not just charts.
- Reports are based on stored sales, stock, cost, expiry, and payment data.

## Milestone 2D: Structured AI Advisor Brief Export

The first analytics workflow should be cheap and portable: generate a structured EOD/weekly brief that management can paste into any AI advisor. A resident LLM/API can be added later only if the exported brief proves useful.

- [x] Add a prompt-ready EOD advisor brief based on deterministic report data.
- [x] Add copy-to-clipboard flow for quick paste into AI advisors.
- [x] Add printable/save-as-PDF report flow for daily management records.
- [x] Add CSV export for Google Sheets, Excel, or later Notion import.
- [x] Keep JSON out of the main operator workflow; use text/CSV first.
- [ ] Add weekly date-range version after more sales history exists.
- [ ] Add saved report snapshots in Supabase so Admin Dashboard can review historical EOD/weekly reports without relying on local downloads.
- [x] Add on-demand historical aggregates from Supabase transaction history before saved snapshots.
- [ ] Add Google Sheets or Notion export automation after the report shape is stable.
- [ ] Add manager notes: accepted, ignored, deferred, or converted to task.
- [ ] Add optional provider-neutral LLM bridge only after exported reports prove useful.

Recommended low-cost workflow:

- Use built-in Top 10 report cards after Close Day.
- Click Print / Save PDF, CSV for Sheets, Download Text, or Copy Advisor Brief.
- Paste into Gemini, ChatGPT, Codex, or another advisor for business strategy review.
- Keep the app operational even when no AI service is connected.

Exit criteria:

- Management can export or copy a structured report from real store data.
- AI advice remains outside the operational database unless management manually applies a decision.
- No paid resident LLM is required for the first analytics workflow.

## Milestone 3: Mobile Admin Capture

- [x] Create mobile-friendly admin capture route, recommended path: `/admin/capture`.
- [x] Require admin PIN/session before capture tools are shown.
- [x] Use back camera for barcode/SKU scanning.
- [x] Use device camera or file picker for item photo capture.
- [x] Upload product photo to Supabase Storage.
- [x] Save product name, SKU/barcode, cost, markup, retail price, stock, pack multiplier, and image path to Supabase.
- [x] If a scanned barcode already exists, load and edit that product instead of creating a duplicate.
- [x] Make the route compile into the Capacitor Android app.
- [ ] Validate the route on Android phone hardware.

Exit criteria:

- Management can add a new item from a phone using camera barcode scan and photo capture.
- The new item appears in Web Admin and Mobile POS without manual database edits.

## Milestone 4: Mobile POS Attendant Flow

- [x] Mobile POS can fetch products from Supabase.
- [x] Mobile POS subscribes to product realtime changes.
- [x] Mobile POS scans barcodes and opens quantity input.
- [x] Mobile POS scanner uses a button-driven real back-camera flow instead of image/file scanning.
- [x] Mobile POS requires assigned attendant email/password before selling.
- [x] Attendant name is saved into checkout, running bills, and live cart monitoring.
- [x] Checkout calls `process_checkout`.
- [x] Checkout can send payment method metadata through `process_checkout_with_payment`.
- [x] Active attendant carts sync to Supabase for management monitoring before checkout.
- [x] Cart item removal requires manager PIN during the pilot workflow.
- [ ] Validate camera permissions and scanner behavior on Android hardware.
- [ ] Improve attendant error states for unknown barcode, insufficient stock, and failed checkout.
- [x] Replace shared attendant password with configured attendant email/password accounts for the pilot.
- [ ] Replace build-time attendant accounts with Supabase Auth attendant accounts before production rollout.
- [ ] Confirm POS layout is usable on target store phones.

Exit criteria:

- Attendant can scan, quantity-select, checkout, and see clear success/failure feedback on a real phone.

## Milestone 5: APK Shipping Path

Debug APK for store testing:

- [ ] Confirm `.env.local` points to the production or pilot Supabase project.
- [x] Run `npm run build` to generate the static export in `out`.
- [x] Generate Android project with `npx cap add android` if `android/` does not exist.
- [x] Sync web assets with `npx cap sync android`.
- [x] Build debug APK with Android Studio or Gradle.
- [x] Split debug build into separate installable POS and Admin APK variants.
- [x] Add branded adaptive launcher icon for Android 8+ devices.
- [ ] Install on test phones and run scanner, checkout, and product sync smoke tests.

Release APK for wider use:

- [ ] Create Android signing keystore.
- [ ] Configure release signing.
- [ ] Build release APK or AAB.
- [ ] Record app version, Supabase project, build date, and Git commit.
- [ ] Archive the signed artifact and signing instructions securely.

Exit criteria:

- Store attendant can install and use the APK on target phones.
- Management knows which app build is deployed.

## Milestone 6: Deployment And Operations

- [ ] Deploy Web Admin Dashboard to the chosen hosting target.
- [ ] Lock down Supabase keys and policies for the chosen access model.
- [ ] Create a basic backup/export routine for sales data.
- [ ] Document daily Close Day workflow.
- [ ] Document emergency recovery steps for failed checkout or device loss.

Exit criteria:

- The store can operate daily without developer intervention for normal sales, inventory updates, and EOD reporting.

## Milestone 7: Restobar Running Bill Mode

- [x] Add database schema for running bill sessions and bill items.
- [x] Add tables, groups, and customer tabs as bill holders.
- [x] Create open bill sessions that can receive multiple item additions over time.
- [x] Support bill states: `open`, `bill_requested`, `partially_paid`, `paid`, `voided`.
- [x] Let attendants add food/drinks to an existing table bill instead of forcing immediate checkout.
- [x] Decrement stock when an order line is confirmed, and restore stock when a line is voided.
- [x] Convert a paid bill into final transaction records for reporting.
- [x] Add Web Admin visibility for open bills and bill aging.
- [x] Add manager-PIN item void for confirmed bill items with stock restoration.
- [x] Add manager-PIN whole bill void with stock restoration.
- [ ] Validate full table-bill workflow on Android hardware with real scan/add/request/settle steps.

Exit criteria:

- A restobar table can order multiple rounds, request the bill, and pay once.
- Paid running bills appear in the same profit and sales reports as normal POS sales.

## Milestone 8: Payments And Accounts Receivable / Utang Ledger

Use `Accounts Receivable` as the accounting name and `Utang Ledger` as the operator-facing label.

- [x] Add payment method fields for cash, GCash, Maya QR, card terminal, USDT manual, and utang ledger.
- [x] Add `accounts_receivable` schema for credit sales with amount, balance, due date, and status.
- [x] Add POS checkout UI controls for payment method, references, and utang customer/due date fields.
- [ ] Add a payments table that supports cash, GCash manual reference, bank transfer, card terminal later, USDT manual later, and mixed payments.
- [ ] Add customer records for repeat credit customers.
- [ ] Add credit sale records with original amount, current balance, promised payment date, collector notes, and status.
- [ ] Support partial payment against an utang balance.
- [x] Show overdue, due today, upcoming, and paid credit lists.
- [ ] Prevent accidental EOD profit mismatch: a credit sale counts as revenue only when the store chooses the accounting rule for receivable recognition.
- [ ] Add manager approval for new utang entries before production use.

Exit criteria:

- Staff can close a bill as `utang` with a promised payment date.
- Management can see who owes money, how much, when it is due, and what has been paid.
- Payments against old balances are recorded without changing historical product COGS.

## Milestone 8A: Live POS Monitor And Manager Voids

- [x] Add `pos_cart_sessions` and `pos_cart_items` for live attendant cart monitoring.
- [x] Add Admin Dashboard Live POS tab showing active carts, items, quantities, prices, totals, attendant, and device.
- [x] Keep costs, markups, reorder data, and inventory-management details out of the attendant POS.
- [x] Add manager-PIN RPC for confirmed bill item voids.
- [x] Add manager-PIN RPC for whole table bill voids.
- [x] Add manager-PIN RPC for completed transaction voids with stock restoration.
- [x] Exclude voided transactions from live/EOD sales and profit reports.
- [ ] Replace hardcoded PIN with Supabase Auth manager role before production.
- [ ] Add full audit log table for void approvals, price edits, stock adjustments, and utang approvals.

Exit criteria:

- Management can see current attendant carts before checkout.
- A manager can void an accidental item, table bill, or transaction while stock and reports stay consistent.
- Attendants still cannot see management-only margin/cost data.

## Milestone 9: Website Ordering And Delivery

- [x] Add unified `orders` schema with POS, table bill, website, Facebook, and TikTok channels.
- [ ] Add customer-facing product/menu ordering route.
- [ ] Separate pickup, dine-in, and delivery order types.
- [ ] Add delivery status flow: `pending`, `accepted`, `preparing`, `ready`, `out_for_delivery`, `delivered`, `cancelled`.
- [ ] Start with manual GCash payment confirmation using reference numbers or uploaded proof.
- [ ] Add staff order approval before inventory is committed for online orders.
- [ ] Add delivery fee, rider/driver assignment, and customer contact details.
- [ ] Sync accepted orders into the same reporting pipeline as POS and running bills.

Exit criteria:

- A customer can place an order from the website.
- Staff can accept, prepare, deliver, and close the order.
- Paid online orders are included in the same daily sales and profit reports.

## Milestone 10: Facebook, TikTok, And Social Order Intake

- [ ] Start with a staff-assisted social order screen where messages from Facebook/TikTok can be manually converted into orders.
- [ ] Track source channel: POS, Web, Facebook, TikTok, phone call, walk-in, or other.
- [ ] Add customer profile matching by name, phone, and social handle.
- [ ] Prepare webhook/API integration only after the manual flow proves the store process.
- [ ] Record ad/order attribution separately from accounting totals.

Exit criteria:

- Social orders can be entered without duplicating products or customer balances.
- The same order, payment, inventory, and delivery engine handles every channel.

## Milestone 11: Production Hardening

- [ ] Replace local PIN-only access with Supabase Auth-backed roles.
- [ ] Tighten RLS policies for admin, attendant, and customer access.
- [ ] Add audit logs for price changes, voids, refunds, stock adjustments, and utang approvals.
- [ ] Add backup/export routine for products, sales, payments, and receivables.
- [ ] Add reports for gross sales, paid sales, receivables, expenses later, and net profit.
- [ ] Add analytics retention and privacy rules for report snapshots and optional AI advisor exports.

Exit criteria:

- The system has clear access control, auditability, and recovery paths before wider rollout.

## Current Next Step

Immediate build order:

1. [x] Apply `database_integrated_upgrade.sql` to the pilot Supabase project.
2. [x] Verify new tables, product analytics columns, and `process_checkout_with_payment` RPC from Supabase.
3. Test one cash sale and one GCash or utang sale to confirm payment fields and live sales update.
4. Confirm an Utang Ledger checkout appears in Admin > Utang Ledger with due-today or overdue reminders.
5. Test product expiry, received date, batch number, perishable flag, and reorder point from Web Admin.
6. Rebuild the debug APK with the verified `.env.local`.
7. Install on an Android phone and validate scanner, checkout, product sync, and mobile admin capture.
8. [x] Build the actual restobar running bill UI on top of the new `bill_sessions` and `bill_items` tables.
9. Test one live restobar bill: open a table, add items, request bill, settle by cash or utang, and confirm EOD/Utang Ledger updates.
10. [x] Add Web Admin visibility for open bills and bill aging.
11. [x] Add live attendant POS cart monitoring and manager-PIN void controls.
12. Test POS phone scanner using real back camera, then confirm the active cart appears in Admin > Live POS.
13. Test manager void for one cart item, one table-bill item, and one completed transaction.
14. Test attendant login on each phone: enter staff email/password, complete a sale, and confirm Admin > Live Sales by Attendant shows the assigned name.
15. Add stored weekly report snapshots, then decide later whether a resident LLM bridge is worth the cost.
