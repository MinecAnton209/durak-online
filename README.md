# Durak Online 🃏 (v4.0.0-RC.7)

A real-time, multiplayer online version of the popular card game "Durak". This project features a clean, intuitive interface, fair gameplay with server-side logic, and easy access for all players.

**Live Demo:** https://durak-online-1li7.onrender.com/
**Telegram Bot:** [t.me/durakthebot](https://t.me/durakthebot)

[Читати цей README на українській](README-UA.md) | [Installation Guide](INSTALL.md)

![Durak Online Gameplay Screenshot](https://github.com/MinecAnton209/durak-online/blob/main/docs/main-img.jpg)

---

## ✨ Features

*   **Real-time Multiplayer:** Play with 2-4 players (including Bots and Guests).
*   **Comprehensive Match Analysis:** Post-game breakdown with move quality (Best Move, Mistake, Blunder) and game reconstruction, inspired by chess.com.
*   **Telegram Bot Integration:** Play directly within Telegram using the web app, manage your profile, and receive notifications.
*   **No Registration Required:** Instantly join a game just by entering a nickname.
*   **Optional User Accounts:** Register to track stats, daily streaks, achievements, and unlock customizations.
*   **Persistent Sessions:** Site remembers you even after a page refresh.
*   **Player Reconnection:** If you accidentally close the tab, you can rejoin an ongoing game.
*   **Game Lobbies:** Host private or public lobbies with custom rules (Deck 36/52, Podkidnoy/Perevodnoy).
*   **Internationalization (i18n):** Interface available in English, Russian, and Ukrainian.
*   **Cheat-Proof:** All game logic is validated on the server.
*   **Mobile-Friendly:** Responsive design and PWA support.

---

## 🛠️ Tech Stack

### Backend
*   **Node.js & Express.js:** Core server and REST API.
*   **Socket.IO:** Real-time bidirectional communication.
*   **Prisma ORM:** Database management with **SQLite** (local) and **PostgreSQL** (production) support.
*   **Telegraf:** Telegram Bot API framework.
*   **Web Push:** Browser notifications support.
*   **bcryptjs:** Secure password hashing.

### Frontend
*   **Vue 3 (Composition API):** Modern reactive UI.
*   **Vite:** Extremely fast build tool and dev server.
*   **Pinia:** State management.
*   **Tailwind CSS:** Utility-first styling with custom glassmorphism components.
*   **Vue I18n:** Localization system.

---

## 🚀 Quick Start

To run this project on your local machine:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/MinecAnton209/durak-online.git
    cd durak-online
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Setup Environment:**
    *   Copy `.env.example` to `.env` and fill in the required variables.

4.  **Check the [Installation Guide](INSTALL.md)** for detailed database setup and configuration steps.

5.  **Start Dev Servers:**
    ```bash
    # Terminal 1 (Backend)
    node server.js

    # Terminal 2 (Frontend)
    cd client && pnpm run dev
    ```

---

## 🗺️ Roadmap (v4.0.0)

### Tier 1: Core UX & Social
- [x] **Match Analysis & History:** Post-match overview and analysis.
- [x] **Telegram Integration:** Full bot support.
- [x] **Achievements System:** Unlockable badges and milestones.
- [x] **Daily Streaks & Rewards:** Incentives for regular players.
- [ ] **Friend System (Enhanced):** Better social interactions and invites.

### Tier 2: Moderation & Anti-Cheat
- [x] **Admin Dashboard:** Comprehensive control over users, games, and sessions.
- [x] **Game Duration Analysis:** Detect suspicious game speed.
- [ ] **Player Karma/Reputation System:** Post-match player rating.

### Tier 3: Expansion
- [x] **Modular Game Architecture:** Ready for adding more card/board games.
- [x] **Switch to JWT:** Improved scalability and stateless auth.
- [ ] **Mobile App (Capacitor):** Native iOS/Android builds.

---

Thank you for your interest in the project! 🃏