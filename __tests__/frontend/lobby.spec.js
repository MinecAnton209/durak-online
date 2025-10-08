const { test, expect } = require('@playwright/test');

test.describe('Game Lobby Creation', () => {
    test('a user should be able to create a game lobby', async ({ page }) => {
        // Navigate to the application's root URL
        await page.goto('http://localhost:3000');

        // 1. Fill in the player name
        const playerName = 'TestPlayer123';
        await page.fill('#playerNameInput', playerName);

        // 2. Click the "Create Game" button
        await page.click('#createGameBtn');

        // 3. Assert that the lobby screen is now visible
        const lobbyScreen = page.locator('#lobby-screen');
        await expect(lobbyScreen).toBeVisible({ timeout: 5000 });

        // 4. Assert that the lobby contains the created game ID
        const lobbyGameId = page.locator('#lobbyGameId');
        await expect(lobbyGameId).not.toBeEmpty();

        // 5. Assert that the player who created the game is in the player list
        const playerList = page.locator('#player-list');
        await expect(playerList).toHaveText(new RegExp(playerName));
    });
});