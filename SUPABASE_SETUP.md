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
5. Click **Run**. This will create the `products`, `transactions`, and `transaction_items` tables, enable real-time tracking, and establish the `process_checkout` RPC function.

## Step 3: Configure Local Environment Variables
To connect the Web Dashboard and the Mobile App to your new database, you need to provide your API keys.

1. In Supabase, navigate to **Project Settings** -> **API**.
2. Locate the **Project URL** and the **anon `public`** key.
3. In the root of this repository, create a file named `.env.local` (you can copy `.env.local.example`).
4. Add the following lines, replacing the placeholder values with your actual Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR_PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_ANON_KEY]
```

## Step 4: Add Initial Inventory (Optional)
If you wish to test the system immediately, you can insert a few initial products using the Admin Dashboard.
1. Run `npm run dev` to start the application.
2. Navigate to `http://localhost:3000/admin`.
3. Enter the default PIN `1234`.
4. Switch to the **Product Management** tab and use the **+ Add New Item** button to create your initial SKUs and prices.

## Notes on Architecture
- **Realtime Sync:** The mobile client automatically subscribes to Postgres changes on the `products` table. Whenever you update a price or add a new SKU in the Admin Dashboard, the mobile app caches update instantly without requiring a refresh.
- **Serverless Security:** By utilizing the `process_checkout` RPC function, the client simply submits a JSON payload. The server-side Postgres function validates inventory levels and calculates exact sub-totals, preventing malicious client manipulation.