# Gemini Balance - Next.js Edition

You can read this document in [Chinese](README_ZH.md).

This project is a high-performance, feature-rich Next.js implementation inspired by the `gemini-balance` Python project. It functions as an intelligent AI gateway, receiving requests through multiple API formats (including OpenAI-compatible) and routing them to Google's Gemini models.

This version goes beyond a simple proxy, offering a robust feature set including a management dashboard, persistent configuration, and advanced authentication, making it a powerful and flexible solution for developers.

## Important Notes

- **Origin & Acknowledgment**: This project is a Next.js implementation of the original Python project [gemini-balance](https://github.com/snailyp/gemini-balance). Special thanks to the original author for the inspiration. It currently implements the core API forwarding and management capabilities, with other features under active development.
- **AI-Generated**: With the exception of this notice, all code and documentation in this project were written by Google's Gemini model.
- **Contributions**: Pull requests are welcome! Please note that PRs will also be reviewed and managed by an AI.
- **Maintenance**: The author is not a Python developer and is unfamiliar with the intricacies of the original project. Future updates and maintenance will be handled by the AI model.

## Core Features

- **Multi-API Interface**:
  - **`/v1beta` & `/gemini`**: Gemini-native proxy endpoints with flexible authentication (API key in URL, `x-goog-api-key` header, or Bearer token).
  - **`/openai`**: An OpenAI-compatible endpoint that requires strict Bearer token authentication.
- **Intelligent Load Balancing**: Manages a pool of Gemini API keys, rotating them to distribute request loads.
- **Automatic Failover & Retry**: If a request fails, it automatically retries with the next available key, ensuring high availability.
- **Persistent Health Tracking**: Monitors key failures, automatically sidelining failing keys and syncing their status to a persistent database.
- **Web UI & Management Dashboard**: A comprehensive admin dashboard at `/admin` for real-time management of API keys, system settings, and log viewing.
- **Dynamic & Persistent Configuration**: All configurations (API keys, auth tokens, etc.) are stored in a persistent SQLite database and can be modified on-the-fly via the Web UI without requiring an application restart.
- **Secure Authentication**:
  - Protects the admin dashboard with a dynamic `AUTH_TOKEN`.
  - Secures API endpoints with a flexible system of `ALLOWED_TOKENS`, all managed through the UI.
- **Externally Triggered Health Checks**: Provides a secure API endpoint for an external cron job to trigger the reactivation check for inactive keys.

## Project Structure & Code Guide

To understand the project, we recommend exploring the files in the following order:

1.  **`prisma/schema.prisma`**: Defines the database schema for storing API keys (`ApiKey`) and dynamic configurations (`Setting`).
2.  **`src/lib/settings.ts`**: The service responsible for fetching and caching all application settings from the database. This is the single source of truth for configuration.
3.  **`src/lib/key-manager.ts`**: The `KeyManager` class, responsible for all API key management. It loads keys **exclusively from the database**, handles rotation, and tracks failures.
4.  **`src/middleware.ts`**: The entry point for all incoming requests. It uses `settings.ts` to fetch authentication tokens dynamically for every request.
5.  **`src/app/admin`**: The code for the admin dashboard, including the UI components (`KeyTable.tsx`, `ConfigForm.tsx`, etc.) and the `actions.ts` file containing all server-side logic for management.
6.  **`/api/cron/health-check`**: A secure API endpoint that, when called, triggers a health check to reactivate failing API keys.

## Getting Started

Follow these steps to get the project running locally.

### 1. Install Dependencies

Navigate to the project directory and install the necessary packages.

```bash
pnpm install
```

### 2. Initialize the Database

This project uses Prisma for database management. Run the following command to create the SQLite database and apply the schema.

```bash
pnpm prisma migrate dev
```

This will create a `prisma/dev.db` file.

### 3. Configure Environment Variables

Create a `.env.local` file. The following variable is required for the application to connect to the database.

- **`DATABASE_URL`**: The connection string for your database. The default `pnpm prisma migrate dev` command will create a SQLite database at `prisma/dev.db`.
  ```
  DATABASE_URL="file:./prisma/dev.db"
  ```

You might also set `GOOGLE_API_HOST` if you need to use a proxy for the Google API. All other settings are managed via the Web UI.

### 4. Run the Development Server

Start the Next.js development server.

```bash
pnpm dev
```

### 5. First-Time Setup via Web UI

On the first run, the application has no API keys or secure authentication tokens.

1.  **Access the Dashboard**: Open [http://localhost:3000/admin](http://localhost:3000/admin). You will be prompted for a password.
2.  **Initial Login**: Since the `AUTH_TOKEN` is initially empty, you must log in by **entering a new, non-empty secret token**. This first token you enter will automatically become the permanent admin password for the system.
3.  **Add API Keys**: After logging in, navigate to the **Keys** tab and click "Add New Key" to paste your Gemini API keys.
4.  **Configure API Access**: Go to the **Configuration** tab and add any tokens you want to grant to your client applications in the "Allowed API Tokens" field.

Your gateway is now fully configured and ready to use.

## Deployment with Vercel (Recommended)

Deploying to Vercel is the recommended method for this project, as it leverages the platform's seamless integration with Next.js and serverless databases.

### 1. Fork the Repository

Click the "Fork" button at the top right of this page to create your own copy of the repository.

### 2. Create a New Project on Vercel

- Go to your Vercel dashboard and click "Add New... -> Project".
- Import the repository you just forked from GitHub.

### 3. Configure the Vercel Project

#### a. Set Up the Database

- While still in the project creation wizard, navigate to the "Storage" tab.
- Click "Add" next to "Postgres" to create a new Vercel Postgres database.
- Accept the terms and click "Create & Connect". Vercel will automatically create the database and set the required environment variables (`POSTGRES_*`) for you.

#### b. Add Required Environment Variables

- Navigate to the "Environment Variables" section.
- The `POSTGRES_*` variables will already be there. You need to add the following:
  - **`DATABASE_URL`**: This variable is still required by Prisma at build time. Set its value to the same value as `POSTGRES_PRISMA_URL`. You can copy it from the variable list above.
  - **`CRON_SECRET`** (Recommended): Set a long, random, and secure string. This will be used to protect the health check endpoint.

#### c. Override the Build Command

- This is the most critical step. In the "Build & Development Settings" section, find the **Build Command** field.
- Click "Override" and set the command to:
  ```bash
  npx prisma migrate deploy && next build
  ```
- This command ensures that every time you deploy, Prisma applies any new database migrations _before_ building the application.

### 4. Deploy

- Click the "Deploy" button. Vercel will now build and deploy your project.

### 5. First-Time Setup

- Once the deployment is complete, visit your new Vercel URL (e.g., `https://your-project-name.vercel.app`).
- Follow the exact same "First-Time Setup via Web UI" steps as in the local development guide to set your admin password and add your Gemini API keys.

### 6. Configure Cron Job on Vercel

- To enable automatic health checks for your API keys, go to the "Cron Jobs" tab in your Vercel project dashboard.
- Create a new cron job with the following settings:
  - **Schedule**: We recommend `0 * * * *` (once every hour).
  - **URL to hit**: Use the `GET` method and enter the following URL, replacing `YOUR_CRON_SECRET` with the value you set in your environment variables:
    ```
    https://YOUR_APP_URL/api/cron/health-check
    ```
    You must also add an `Authorization` header with the value `Bearer YOUR_CRON_SECRET`. Vercel's UI has a dedicated section for adding headers to cron job requests.

Your application is now fully deployed and configured on Vercel.

## Deployment with Docker

This project is a **stateful application** that requires a persistent database. The provided `Dockerfile` and `docker-compose.yml` are optimized for production deployment.

### Deployment Principles

- **Dynamic Configuration**: The application is designed to be configured at runtime via the Web UI. The Docker image is generic and does not contain any secrets.
- **Persistent Data**: The `docker-compose.yml` file is configured to mount a local `./data` directory to `/app/data` inside the container. This ensures that your SQLite database (and all your settings) persists across container restarts.
- **Automated Migrations**: An `entrypoint.sh` script automatically runs database migrations (`prisma migrate deploy`) every time the container starts, ensuring your schema is always up-to-date.

### Running with Docker Compose

1.  **Create and configure the `.env` file**:

    Create a `.env` file for your production environment. The `docker-compose.yml` file is configured to load this file.

    - **`DATABASE_URL` (Mandatory)**: This variable is required. The Compose setup is configured to place the database in a persistent volume at `/app/data`.
    - **`CRON_SECRET` (Recommended)**: To use the external health check feature, you must set a secure secret token.

    Your `.env` file should look like this:

    ```env
    # Mandatory: Path for the production database inside the container
    DATABASE_URL="file:/app/data/prod.db"

    # Recommended: A long, random secret for the cron job endpoint
    CRON_SECRET="your-long-random-secret-token"
    ```

    **Important**: You only need to set `DATABASE_URL` and `CRON_SECRET` for Docker deployment. Variables like `POSTGRES_PRISMA_URL` are for Vercel deployment only. All other settings are managed via the Web UI after deployment.

2.  **Build and run the container**:

    ```bash
    docker-compose up --build -d
    ```

3.  **Perform First-Time Setup**: Follow the same "First-Time Setup via Web UI" steps as in the local development guide, but access the application at the server's IP address (e.g., `http://YOUR_SERVER_IP:3000`).

4.  **(Optional) Configure Cron Job**: To enable automatic reactivation of failed API keys, follow the instructions in the "External Cron Job for Health Checks" section below.

## External Cron Job for Health Checks

This application relies on an external cron job to periodically check the health of inactive API keys and reactivate them. The app provides a secure endpoint for this purpose.

### 1. Set the Cron Secret

To protect the cron endpoint, you must set the `CRON_SECRET` environment variable.

- For **local development**, add it to your `.env.local` file.
- For **Docker deployment**, add it to the `.env` file as described in the "Deployment with Docker" section.

Choose a long, random, and hard-to-guess string for this value.

### 2. Configure Your Cron Service

You need to set up a cron job on your server or using a third-party service (like `cron-job.org` or a feature of your hosting platform like Coolify).

The job should be configured to run a `curl` command periodically. We recommend running it **once every hour**.

Here is the command to execute:

```bash
curl -X GET -H "Authorization: Bearer YOUR_CRON_SECRET" http://YOUR_APP_URL/api/cron/health-check
```

- Replace `YOUR_CRON_SECRET` with the same secret value you set in your environment variables.
- Replace `YOUR_APP_URL` with the public URL of your application (e.g., `http://localhost:3000` for local testing, or `https://your-domain.com` in production).

This setup ensures that your keys are regularly checked and maintained without requiring a scheduler inside the application itself.

## CI/CD with GitHub Actions

The included GitHub Actions workflow is designed for a modern, configuration-free deployment pipeline.

- **What it Does**: On every push to the `master` branch, the action builds a **generic, configuration-free** Docker image and pushes it to the GitHub Container Registry (`ghcr.io`).
- **No Secrets Needed**: The workflow **does not** require any secrets like `GEMINI_API_KEYS` or `AUTH_TOKEN`. The image it builds is universal.
- **How to Use**:
  1.  Fork the repository.
  2.  The GitHub Action will run automatically, pushing the image to `ghcr.io/YOUR_USERNAME/gemini-balance-nextjs`.
  3.  On your server, you can simply pull the latest image (`docker pull ghcr.io/YOUR_USERNAME/gemini-balance-nextjs:latest`) and restart your Docker Compose setup to update.
  4.  For fully automated deployments, you can use a service like [Watchtower](https://containrrr.dev/watchtower/) or a webhook from your hosting provider (like Coolify) to automatically pull the new image and redeploy.

### 6. Explore the Application

- **Admin Dashboard**: Open [http://localhost:3000/admin](http://localhost:3000/admin) and log in with the `AUTH_TOKEN` you configured in the UI.
- **API Endpoints**: Use a tool like `curl` or Postman to interact with the API endpoints, providing a token you configured under "Allowed API Tokens".

**Example `curl` for Gemini/v1beta:**

```bash
curl -X POST http://localhost:3000/v1beta/models/gemini-pro:generateContent?key=user_token_1 \
-H "Content-Type: application/json" \
-d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

**Example `curl` for OpenAI:**

```bash
curl -X POST http://localhost:3000/openai/v1/chat/completions \
-H "Content-Type: application/json" \
-H "Authorization: Bearer user_token_1" \
-d '{"model": "gemini-pro", "messages": [{"role": "user", "content": "Hello!"}]}'
```
