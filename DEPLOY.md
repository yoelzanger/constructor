# Deploying Constructor to Railway

This guide will help you deploy your application to Railway, a platform that makes it easy to run Docker containers and manage databases.

## Prerequisites
-   A GitHub account.
-   A [Railway.app](https://railway.app/) account (Sign up with GitHub).

## Step 1: Push Code to GitHub
Ensure your latest changes (including the new `Dockerfile` and `prisma/schema.postgres.prisma`) are committed and pushed to your GitHub repository.

```bash
git add .
git commit -m "Configure deployment"
git push
```

## Step 2: Create a New Project on Railway
1.  Go to your [Railway Dashboard](https://railway.app/dashboard).
2.  Click **"New Project"** -> **"Deploy from GitHub repo"**.
3.  Select your repository (`constructor` or whatever you named it).
4.  Click **"Deploy Now"**.

## Step 3: Add a Database
1.  In your project view, click **"New"** (or right-click empty space).
2.  Select **"Database"** -> **"PostgreSQL"**.
3.  Wait for it to initialize.

## Step 4: Connect the Database to the App
1.  Click on your **PostgreSQL** card.
2.  Go to the **"Variables"** tab.
3.  Copy the `DATABASE_URL` value (it will look like `postgresql://postgres:password@roundhouse.proxy.rlwy.net:PORT/railway`).
4.  Click on your **App** card (the one deployed from GitHub).
5.  Go to the **"Variables"** tab.
6.  Click **"New Variable"**.
7.  Key: `DATABASE_URL`
8.  Value: Paste the URL you copied.
9.  **Add other environment variables** from your `.env` file:
    -   `ANTHROPIC_API_KEY`: Your Claude API key.
    -   (Optional) `NODE_ENV`: `production` (Railway usually sets this).

## Step 5: Add Persistent Storage (For PDFs)
1.  Click on your **App** card.
2.  Go to the **"Volumes"** tab.
3.  Click **"Add Volume"**.
4.  Mount Path: `/app/data` (This matches the path in our Dockerfile).
5.  This ensures your uploaded PDFs and reports are saved even if you redeploy the app.

## Step 6: Redeploy
1.  Railway usually redeploys automatically when variables change. If not, go to the **"Deployments"** tab and click **"Redeploy"**.
2.  Watch the build logs. It should run `prisma generate` and build successfully.

## Notes
-   **Database Migration**: The app is configured to use the existing database schema. If you need to "push" changes to the production DB, you can add a "Deploy Command" in Railway settings: `npx prisma db push --schema=prisma/schema.postgres.prisma`.
-   **Background Worker**: The `process-pdfs.js` script needs to run. You can:
    -   Run it manually via Railway CLI (advanced).
    -   **Recommended**: Add a second service in Railway (start from same repo), and set its "Start Command" to `node scripts/process-pdfs.js` (or similar, depending on how you want it to run - e.g. loop forever or use cron). 
    -   *Simpler*: modify the script to run in a loop and set that as the start command for a "Worker" service.

## Accessing Your App
-   Go to the **"Settings"** tab of your App card.
-   Under **"Networking"**, click **"Generate Domain"**.
-   Open your new URL!
