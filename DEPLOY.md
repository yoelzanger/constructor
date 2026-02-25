# Deploying Constructor to Vercel

## Prerequisites
- A [Vercel](https://vercel.com/) account (yours: yoelzanger@gmail.com).
- A [Neon](https://neon.tech/) account for hosted PostgreSQL (free).

---

## Step 1: Set Up Neon Database

1. Go to [neon.tech](https://neon.tech/) and sign in.
2. Create a new project (e.g. `constructor`).
3. Once created, copy the **Connection String** (it looks like `postgresql://user:pass@host/dbname?sslmode=require`).

---

## Step 2: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Click **"Import Git Repository"** and select `tombensim/constructor`.
3. Click **"Deploy"** — Vercel will build the project.

---

## Step 3: Add Blob Storage

1. In your Vercel project dashboard, go to the **Storage** tab.
2. Click **"Create Database"** → select **"Blob"**.
3. Vercel will automatically add `BLOB_READ_WRITE_TOKEN` to your environment variables.

---

## Step 4: Configure Environment Variables

In your Vercel project dashboard → **Settings** → **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Neon connection string |
| `ANTHROPIC_API_KEY` | Your Claude API key (`sk-ant-...`) |
| `CRON_SECRET` | Any random secret (e.g. run `openssl rand -hex 32`) |
| `BLOB_READ_WRITE_TOKEN` | Auto-added when you created Blob storage |

---

## Step 5: Push Database Schema

After the first deployment, push the schema to Neon:

```bash
# In your local terminal, with DATABASE_URL set to your Neon URL:
$env:DATABASE_URL="postgresql://..."   # PowerShell
npx prisma db push --schema=prisma/schema.prisma
```

---

## Step 6: Redeploy

In Vercel → **Deployments** → click **"Redeploy"** after setting environment variables.

---

## How It Works in Production

- **PDF Upload**: When you upload a PDF, it's stored in **Vercel Blob** (cloud storage).
- **Processing**: Every minute, Vercel Cron calls `/api/process-pdfs` which reads the PDF from Blob and extracts data using Claude.
- **Database**: All data is stored in **Neon PostgreSQL**.

---

## Notes
- The Cron job runs every minute but only picks up unprocessed reports, so it's lightweight.
- The `CRON_SECRET` prevents unauthorized access to the processing endpoint.
