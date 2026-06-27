# Supabase Serverless Setup Guide

This project relies on a 100% serverless cloud database architecture utilizing Supabase. Since there is no persistent Node.js backend middleware, all database schema logic and security policies are handled natively within Supabase.

Please follow these steps to initialize your project correctly.

## Step 1: Create a Supabase Project
1. Go to [Supabase](https://supabase.com) and create a new project.
2. Wait for the database to finish provisioning.

## Step 2: Apply the Database Schema
To create the necessary tables, relationships, and the secure atomic checkout function, you must run the provided SQL script:
1. In your Supabase dashboard, navigate to the **SQL Editor** on the left-hand sidebar.
2. Click **New query**.
3. Open the `database_schema.sql` file located in the root of this repository.
4. Copy the entire contents of `database_schema.sql` and paste it into the Supabase SQL Editor.
5. Click **Run**. This will create the inventory, POS transaction, running bill, accounts receivable, and omnichannel order tables; enable real-time tracking; create the `product-images` Storage bucket; establish MVP access policies; and establish the checkout RPC functions.

### Existing Supabase Projects

If you already ran an earlier version of `database_schema.sql`, run these SQL files in this order:

1. `database_product_photos_update.sql`
2. `database_integrated_upgrade.sql`
3. `database_restobar_billing_update.sql`
4. `database_pos_live_void_update.sql`

The integrated upgrade adds product expiry/received/batch tracking, restobar running bill tables, accounts receivable / utang ledger tables, omnichannel orders, payment method fields, explicit Data API grants, MVP RLS policies, and the `process_checkout_with_payment` RPC.
The restobar billing update adds server-side functions for opening bills, adding confirmed items, requesting a bill, settling a bill into transactions/utang, and voiding a bill with stock restoration.
The POS live/void update adds active attendant cart monitoring plus manager-PIN void functions for bill items, whole bills, and completed transactions.

## Step 3: Configure Local Environment Variables
To connect the Web Dashboard and the Mobile App to your new database, you need to provide your API keys.

1. In Supabase, navigate to **Project Settings** -> **API**.
2. Locate the **Project URL** and the **anon `public`** key.
3. In the root of this repository, create a file named `.env.local` (you can copy `.env.local.example`).
4. Add the following lines, replacing the placeholder values with your actual Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR_PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_ANON_KEY]
NEXT_PUBLIC_ATTENDANT_ACCOUNTS=Attendant 1|attendant1@mhenching.local|MHC-1-7429;Attendant 2|attendant2@mhenching.local|MHC-2-6184
NEXT_PUBLIC_MANAGER_PIN=1234
```

## Step 4: Add Initial Inventory (Optional)
If you wish to test the system immediately, you can insert a few initial products using the Admin Dashboard.
1. Run `npm run dev` to start the application.
2. Open the POS at `http://localhost:3000`, then log in with an assigned attendant email and password.
3. Navigate to `http://localhost:3000/admin`.
4. Enter the default manager PIN `1234`.
5. Switch to the **Product Management** tab and use the **+ Add New Item** button to create your initial SKUs and prices.

For phone-based product setup with barcode scanning and item photos:
1. Navigate to `http://localhost:3000/admin/capture` on a phone.
2. Enter the default manager PIN `1234`.
3. Scan or type the SKU/barcode, take the product photo, enter cost/markup/stock values, and save.

## Notes on Architecture
- **Realtime Sync:** The mobile client automatically subscribes to Postgres changes on the `products` table. Whenever you update a price or add a new SKU in the Admin Dashboard, the mobile app caches update instantly without requiring a refresh.
- **Product Photos:** Product photos are stored in the public `product-images` Supabase Storage bucket. The product row stores the object path in `products.image_path`.
- **Serverless Security:** By utilizing the `process_checkout` RPC function, the client simply submits a JSON payload. The server-side Postgres function validates inventory levels and calculates exact sub-totals, preventing malicious client manipulation.
- **Payment Tracking:** New builds call `process_checkout_with_payment` for cash, GCash, Maya QR, card terminal, USDT manual, and utang ledger metadata. The older `process_checkout` function remains as a cash-compatible wrapper.
- **Running Bills:** The POS can switch to Table Bill mode. Confirmed table-bill items decrement stock immediately, manager-approved item voids restore stock, and settling the bill creates final transaction records for EOD reporting.
- **Live POS Monitor:** The Admin Dashboard has a Live POS tab that shows active attendant carts before checkout and recent same-day transactions without exposing cost, markup, or inventory management data to attendants.
- **Attendant Login:** The POS asks for an assigned attendant email and password once per phone per calendar day. The attendant name is saved to sales, table bills, and live cart monitoring so Admin can compare running sales by attendant.
- **Report Exports:** The EOD dashboard can print/save the report as PDF, download a plain-text advisor brief, and download a CSV file for Google Sheets, Excel, or later Notion import. Browser security does not allow the web app to silently write to an arbitrary local folder; downloads and print/save are the reliable local-drive workflow for now.
- **Historical Reports:** Admin Dashboard includes a Sales Reports tab for daily, weekly, and monthly aggregates from transaction history. Management can reopen any past date, week, or month and review compounded revenue, COGS, profit, item sales, and sales by attendant.
- **Analytics Foundation:** Product rows can now store received date, expiry date, batch number, perishable flag, and reorder point so the dashboard can flag FIFO, expiry, slow-moving stock, and stockout risk.
- **Fast-Moving Replenishment Plan:** The Admin Dashboard compares top-selling items against current inventory and reorder points, then estimates suggested buy quantity and capital needed for restocking. This appears in the live analytics view, historical reports, CSV exports, and copy/paste advisor brief.
- **MVP Access Policy:** The current app uses a shared publishable anon key and a local PIN gate. The SQL policies are intentionally MVP-open for the current pilot workflow. Replace these with authenticated admin/attendant roles before wider production rollout.
