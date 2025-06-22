# Durak Online 🃏

A real-time, multiplayer online version of the popular card game "Durak". This project was built from scratch with a focus on a clean, intuitive interface, fair gameplay with server-side logic, and easy access for all players without mandatory registration.

**Live Demo:** https://durak-online-1li7.onrender.com/

[Read this README in Ukrainian](README-UA.md)

![Durak Online Gameplay Screenshot](https://github.com/MinecAnton209/durak-online/blob/main/docs/main-img.jpg)

---

## ✨ Features

*   **Real-time Multiplayer:** Play with 2-4 players in a single room.
*   **No Registration Required:** Instantly join a game just by entering a nickname.
*   **Optional User Accounts:** Register to track stats, daily streaks, and unlock customizations.
*   **Persistent Sessions:** The site remembers you after a page refresh.
*   **Player Reconnection:** If you accidentally close the tab or lose connection, you can rejoin an ongoing game.
*   **Game Lobbies:** The host can wait for players and start the game when ready.
*   **Customization:** Verified users can choose different card back styles.
*   **In-Game Communication:** A unified game log and chat to see moves and communicate with players.
*   **Internationalization (i18n):** The interface is available in multiple languages.
*   **Cheat-Proof:** All game logic is validated on the server.
*   **Mobile-Friendly:** Responsive design for a great experience on any device.

---

## 🛠️ Tech Stack

### Backend
*   **Node.js:** JavaScript runtime environment.
*   **Express.js:** Web framework for API and routing.
*   **Socket.IO:** Library for real-time, bidirectional communication (WebSockets).
*   **SQLite3:** A lightweight, file-based database for storing user data and stats.
*   **bcrypt:** Library for securely hashing passwords.
*   **express-session & connect-sqlite3:** For managing user sessions.

### Frontend
*   **HTML5**
*   **CSS3:** Modern styling with Flexbox, Grid, animations, and responsive design.
*   **JavaScript (ES6+):** Vanilla JS for all client-side logic, with no frameworks.

---

## 🚀 Local Setup

To run this project on your local machine, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/MinecAnton209/durak-online.git
    cd durak-online
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create the environment file:**
    *   Copy `.env.example` and rename it to `.env`.
    *   Open `.env` and set a value for `SESSION_SECRET`:
      ```
      SESSION_SECRET="your_very_long_and_random_secret_string"
      ```

4.  **Start the server:**
    ```bash
    node server.js
    ```

5.  **Open the game in your browser:**
    Navigate to `http://localhost:3000`.

---

## 🗺️ Roadmap

This project is actively being developed. Here are some of the planned features, categorized by priority.

### Tier 1: Core UX & Community Features
- [x] **Game Event Log & Chat:** A unified log to track moves and communicate.
- [ ] **Player Achievements:** Unlockable badges for in-game accomplishments (e.g., "First Win", "100 Games Played").
- [ ] **Daily Streaks & Rewards:** Incentives for playing daily, including visual indicators like a "fire" icon.
- [ ] **Card Back Customization:** Allow registered users to choose their card back design.
- [ ] **Emotes / Quick Reactions:** A safe and fun way to communicate in-game.

### Tier 2: Anti-Cheat & Moderation
- [ ] **Game Duration Analysis:** Flag games that end suspiciously fast.
- [ ] **Matchup Analysis:** Detect patterns of collusion between specific players.
- [ ] **Player Karma/Reputation System:** Allow players to rate each other after a match.

### Tier 3: Platform Expansion
- [ ] **Modular Game Architecture:** Refactor the core logic to easily add new games.
- [ ] **New Games:** Add classics like Checkers, Chess, etc.
- [ ] **Authentication with JWT:** Switch from sessions to JSON Web Tokens for better scalability.

---

Thank you for your interest in the project!