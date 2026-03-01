# 🛠 Installation and Setup Guide

This guide will help you get the **Durak Online** project up and running on your local machine.

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
*   **Node.js**: Version 20 or higher (LTS recommended).
*   **pnpm**: Recommended package manager (can be installed via `npm install -g pnpm`).
*   **Git**: For version control.
*   **SQLite** (optional, for direct DB inspection).

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/MinecAnton209/durak-online.git
cd durak-online
```

### 2. Install Dependencies
This project uses a monorepo structure with `pnpm` workspaces.
```bash
pnpm install
```

### 3. Configure Environment Variables
Copy the example environment file and fill in the necessary secrets.
```bash
cp .env.example .env
```
Open `.env` and fill in the following:
*   `JWT_SECRET`: Generate a strong secret (see instructions in `.env`).
*   `SESSION_SECRET`: A long random string.
*   `TELEGRAM_BOT_TOKEN`: (Optional) If you want to use the Telegram bot integration.

### 4. Setup the Database (Prisma)
We use Prisma as an ORM. By default, it uses SQLite.
```bash
# Initialize the database and generate Prisma Client
npx prisma generate
npx prisma db push
```

### 5. Generate VAPID Keys (for Notifications)
```bash
node generate-vapid.js
```
Copy the output keys into your `.env` file under `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

---

## 🛠 Running the Application

### Development Mode
Runs the backend with auto-reload and the frontend dev server.
```bash
# Start the backend (Express server)
node server.js

# In another terminal, start the frontend (Vite)
cd client
pnpm run dev
```

### Production Build
If you want to test the production build locally:
```bash
# Build the frontend
cd client
pnpm run build

# Start the backend (it will serve the built files from client/dist)
cd ..
NODE_ENV=production node server.js
```

---

## 📱 Telegram Bot Integration (Optional)

1.  Create a new bot via [@BotFather](https://t.me/BotFather).
2.  Get the HTTP API Token and add it to `TELEGRAM_BOT_TOKEN` in `.env`.
3.  Fill in the `APP_URL` in `services/telegramBot.js` with your application's public URL (or local tunnel).

## 🧪 Testing
```bash
pnpm test
```

## 🐞 Troubleshooting

*   **Database Errors**: If you encounter issues with Prisma, try running `npx prisma db push --force-reset`.
*   **Port 3000 Busy**: Change the `PORT` in your `.env` file.
*   **CORS Issues**: Ensure `ADMIN_CORS_ORIGIN` matches your frontend URL (e.g., `http://localhost:5173`).

---

Thank you for contributing to **Durak Online**! 🃏
