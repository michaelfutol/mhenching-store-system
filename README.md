# Mhenching Store System

Mhenching Store System is a serverless Next.js, Supabase, and Capacitor POS system for store attendants and management.

## Interfaces

- Mobile POS: attendants use phones for barcode scanning, quantity entry, and checkout.
- Web Admin Dashboard: management uses desktop or web for pricing, markups, stock, and EOD profit reports.
- Mobile Admin Capture: management uses a phone camera to scan new item barcodes and capture product photos.
- Restobar Mode: planned running bills for tables, groups, and customer tabs.
- Accounts Receivable / Utang Ledger: planned credit tracking for approved pay-later customers.
- Online Ordering: planned website, delivery, and social-channel order intake.
- Business Analytics / AI Advisor Briefs: EOD and weekly structured reports that can be copied into external AI advisors.

All interfaces share the same Supabase data source.

## Current Build Focus

Follow [MILESTONES.md](./MILESTONES.md) as the source of truth for build order, checklist status, and APK shipping steps.

Immediate focus is applying the integrated Supabase upgrade, validating live same-day sales visibility, testing inventory intelligence fields, report cards, and copy/export advisor briefs, then Android phone validation.

See [ANDROID_BUILD.md](./ANDROID_BUILD.md) for the repeatable debug APK build commands.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` for the POS and `http://localhost:3000/admin` for the web admin dashboard.

Use `http://localhost:3000/admin/capture` on a phone for barcode scan plus item photo capture.

## Required Environment

Create `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR_PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_ANON_KEY]
```

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for database setup.
