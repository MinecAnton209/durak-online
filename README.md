# Durak Online 🃏

A real-time, multiplayer online version of the popular card game "Durak". This project was built from scratch with a focus on a clean, intuitive interface, fair gameplay with server-side logic, and easy access for all players without mandatory registration.

**Live Demo:** https://durak-online-1li7.onrender.com/

[Read this README in Ukrainian](README-UA.md)

![Durak Online Gameplay Screenshot]([https://github.com/MinecAnton209/durak-online/blob/main/docs/main-img.jpg])

---

## ✨ Features

*   **Play without Registration:** Anyone can join a game instantly just by entering a nickname.
*   **Multiplayer Mode:** Supports 2 to 4 players in a single game room.
*   **Private Rooms:** Create games and invite friends with a unique, shareable link.
*   **Flexible Game Settings:** Choose the deck size (24, 36, or 52 cards) and the number of players.
*   **Cheat-Proof:** All game logic and rule validation are handled on the server.
*   **Optional User Accounts:**
    *   Persistent stats tracking (wins/losses).
    *   A permanent username.
    *   User sessions (the site remembers you after a page refresh).
*   **Interactive UI:**
    *   Smooth animations for card plays and actions.
    *   Highlighting of playable cards.
    *   Responsive design for mobile and tablet devices.
*   **Lobby System:** The game host can wait for players and start the game early.
*   **Rematch System:** Quickly start a new game with the same group of players.

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

This project is actively being developed. Here are some of the planned features:

*   [ ] **Game Event Log:** A history of moves made in the current game.
*   [ ] **In-Game Chat:** A simple chat for players in the room.
*   [ ] **Daily Streaks:** Rewards for playing daily.
*   [ ] **Achievements:** Icons and awards for completing in-game challenges.
*   [ ] **Customization:** Ability to choose different card back designs.
*   [ ] **Expansion to a Game Hub:** Adding new games (e.g., Checkers, Chess).

---

Thank you for your interest in the project!