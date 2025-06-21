const socket = io({ transports: ['websocket'] });
const welcomeScreen = document.getElementById('welcome-screen');
const gameScreen = document.getElementById('game-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const winnerScreen = document.getElementById('winner-screen');
const createGameBtn = document.getElementById('createGameBtn');
const joinGameBtn = document.getElementById('joinGameBtn');
const playerNameInput = document.getElementById('playerNameInput');
const gameIdDisplay = document.getElementById('gameIdDisplay');
const inviteLink = document.getElementById('inviteLink');
const errorMessage = document.getElementById('error-message');
const turnStatus = document.getElementById('turn-status');
const errorToast = document.getElementById('error-toast');
const trumpCardDisplay = document.getElementById('trump-card-display');
const deckCountDisplay = document.getElementById('deck-count-display');
const centerAnimationContainer = document.getElementById('center-animation-container');
const playerArea = document.getElementById('player-area');
const playerCards = document.getElementById('player-cards');
const gameTable = document.getElementById('game-table');
const actionButtons = document.getElementById('action-buttons');
const winnerMessage = document.getElementById('winner-message');
const playerName = document.getElementById('playerName');
const rematchBtn = document.getElementById('rematchBtn');
const rematchStatus = document.getElementById('rematch-status');
const lobbyGameId = document.getElementById('lobbyGameId');
const lobbyInviteLink = document.getElementById('lobbyInviteLink');
const playerList = document.getElementById('player-list');
const lobbyStatus = document.getElementById('lobby-status');
const hostControls = document.getElementById('host-controls');
const startGameBtn = document.getElementById('startGameBtn');
const copyLobbyLinkBtn = document.getElementById('copyLobbyLinkBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const userProfile = document.getElementById('user-profile');
const guestLogin = document.getElementById('guest-login');
const profileUsername = document.getElementById('profile-username');
const profileWins = document.getElementById('profile-wins');
const profileLosses = document.getElementById('profile-losses');
const logoutBtn = document.getElementById('logoutBtn');
const showLoginBtn = document.getElementById('showLoginBtn');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const authModal = document.getElementById('auth-modal');
const closeModalBtn = document.querySelector('.close-modal-btn');
const modalTitle = document.getElementById('modal-title');
const authForm = document.getElementById('auth-form');
const authUsernameInput = document.getElementById('authUsername');
const authPasswordInput = document.getElementById('authPassword');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('auth-error');
const gameLogContainer = document.getElementById('game-log-container');
const gameLogList = document.getElementById('game-log-list');
const closeLogBtn = document.getElementById('close-log-btn');
const showLogBtnMobile = document.getElementById('show-log-btn-mobile');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

let playerId = null; let gameId = null; let lastGameState = null;

function copyLink(inputElement, buttonElement) { if (!inputElement || !buttonElement) return; const textToCopy = inputElement.value; if (!textToCopy) return; navigator.clipboard.writeText(textToCopy).then(() => { const originalIcon = buttonElement.innerHTML; buttonElement.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`; setTimeout(() => { buttonElement.innerHTML = originalIcon; }, 2000); }).catch(err => { console.error('Не вдалося скопіювати текст: ', err); inputElement.select(); document.execCommand('copy'); }); }
function openModal(mode) { authModal.style.display = 'flex'; authError.innerText = ''; authForm.reset(); if (mode === 'login') { modalTitle.innerText = 'Вхід'; authSubmitBtn.innerText = 'Увійти'; authForm.dataset.mode = 'login'; } else { modalTitle.innerText = 'Реєстрація'; authSubmitBtn.innerText = 'Зареєструватися'; authForm.dataset.mode = 'register'; } }
function closeModal() { authModal.style.display = 'none'; }
function showUserProfile(user) { guestLogin.style.display = 'none'; userProfile.style.display = 'block'; let profileNameHTML = user.username; if (user.streak > 0) { profileNameHTML += ` <span class="streak-fire">🔥${user.streak}</span>`; } profileUsername.innerHTML = profileNameHTML; profileWins.innerText = user.wins; profileLosses.innerText = user.losses; playerNameInput.value = user.username; playerNameInput.disabled = true; }
function showGuestLogin() { guestLogin.style.display = 'block'; userProfile.style.display = 'none'; playerNameInput.value = `Гравець_${Math.floor(Math.random() * 1000)}`; playerNameInput.disabled = false; }

window.addEventListener('DOMContentLoaded', () => {
    fetch('/check-session').then(res => res.json()).then(data => { if (data.isLoggedIn) { showUserProfile(data.user); } }).catch(error => console.error('Помилка перевірки сесії:', error));
    const urlParams = new URLSearchParams(window.location.search);
    const joinGameId = urlParams.get('gameId')?.toUpperCase();
    if (joinGameId) { document.getElementById('join-game-section').style.display = 'block'; gameId = joinGameId; }
    createGameBtn.addEventListener('click', () => { const playerNameValue = playerNameInput.value; if (!playerNameValue) { errorMessage.innerText = "Будь ласка, введіть ім'я."; return; } const settings = { playerName: playerNameValue, deckSize: parseInt(document.getElementById('deckSize').value, 10), maxPlayers: parseInt(document.getElementById('maxPlayers').value, 10), customId: document.getElementById('customGameId').value.trim().toUpperCase() }; socket.emit('createGame', settings); });
    joinGameBtn.addEventListener('click', () => { const playerNameValue = playerNameInput.value; if (!playerNameValue) { errorMessage.innerText = "Будь ласка, введіть ім'я."; return; } socket.emit('joinGame', { gameId, playerName: playerNameValue }); });
    rematchBtn.addEventListener('click', () => { socket.emit('requestRematch', { gameId }); rematchBtn.disabled = true; rematchBtn.innerText = 'Очікуємо на інших...'; });
    startGameBtn.addEventListener('click', () => { socket.emit('forceStartGame', { gameId }); });
    logoutBtn.addEventListener('click', async () => { try { await fetch('/logout', { method: 'POST' }); showGuestLogin(); } catch (error) { console.error('Помилка виходу:', error); } });
    copyLobbyLinkBtn.addEventListener('click', () => copyLink(lobbyInviteLink, copyLobbyLinkBtn));
    copyLinkBtn.addEventListener('click', () => copyLink(inviteLink, copyLinkBtn));
    showLoginBtn.addEventListener('click', () => openModal('login'));
    showRegisterBtn.addEventListener('click', () => openModal('register'));
    closeModalBtn.addEventListener('click', closeModal);
    authModal.addEventListener('click', (e) => { if (e.target === authModal) closeModal(); });
    authForm.addEventListener('submit', async (e) => { e.preventDefault(); const username = authUsernameInput.value; const password = authPasswordInput.value; const mode = authForm.dataset.mode; const endpoint = (mode === 'login') ? '/login' : '/register'; authSubmitBtn.disabled = true; authError.innerText = ''; try { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }); const result = await response.json(); if (response.ok) { alert(result.message); closeModal(); if (result.user) { showUserProfile(result.user); } } else { authError.innerText = result.message; } } catch (error) { authError.innerText = 'Сталася помилка з\'єднання.'; } finally { authSubmitBtn.disabled = false; } });
    showLogBtnMobile.addEventListener('click', () => gameLogContainer.classList.add('visible'));
    closeLogBtn.addEventListener('click', () => gameLogContainer.classList.remove('visible'));
    chatForm.addEventListener('submit', (e) => { e.preventDefault(); const message = chatInput.value; if (message.trim()) { socket.emit('sendMessage', { gameId, message }); chatInput.value = ''; } });
});

socket.on('gameCreated', (data) => { gameId = data.gameId; playerId = data.playerId; welcomeScreen.style.display = 'none'; lobbyScreen.style.display = 'block'; lobbyGameId.innerText = gameId; const link = `${window.location.origin}?gameId=${gameId}`; lobbyInviteLink.value = link; inviteLink.value = link; socket.emit('getLobbyState', { gameId }); });
socket.on('joinSuccess', (data) => { playerId = data.playerId; gameId = data.gameId; welcomeScreen.style.display = 'none'; lobbyScreen.style.display = 'block'; lobbyGameId.innerText = gameId; const link = `${window.location.origin}?gameId=${gameId}`; lobbyInviteLink.value = link; inviteLink.value = link; socket.emit('getLobbyState', { gameId }); });
socket.on('playerJoined', () => { if(gameId) socket.emit('getLobbyState', { gameId }); });
socket.on('lobbyStateUpdate', ({ players, maxPlayers, hostId }) => { playerList.innerHTML = ''; let hostName = ''; players.forEach(player => { const li = document.createElement('li'); let playerLabelHTML = player.name; if (player.streak > 0) { playerLabelHTML += ` <span class="streak-fire">🔥${player.streak}</span>`; } if (player.id === hostId) { playerLabelHTML += ' 👑 (Хост)'; hostName = player.name; } li.innerHTML = playerLabelHTML; playerList.appendChild(li); }); lobbyStatus.innerText = `Очікуємо на гравців... (${players.length}/${maxPlayers})`; if (playerId === hostId) { hostControls.style.display = 'block'; if (players.length >= 2) { startGameBtn.disabled = false; startGameBtn.innerText = `Почати гру (${players.length})`; } else { startGameBtn.disabled = true; startGameBtn.innerText = 'Потрібно більше гравців'; } } else { hostControls.style.display = 'none'; lobbyStatus.innerText = `Очікуємо, поки ${hostName || 'хост'} почне гру... (${players.length}/${maxPlayers})`; } });
socket.on('error', (message) => { errorMessage.style.display = 'block'; errorMessage.innerText = message; welcomeScreen.classList.add('shake'); setTimeout(() => welcomeScreen.classList.remove('shake'), 500); });
socket.on('invalidMove', ({ reason }) => { errorToast.innerText = reason; errorToast.classList.add('visible'); const flyingCard = document.querySelector('.card.animate-play'); if (flyingCard) { flyingCard.classList.remove('animate-play'); flyingCard.classList.add('shake-card'); setTimeout(() => flyingCard.classList.remove('shake-card'), 400); } setTimeout(() => errorToast.classList.remove('visible'), 3000); });
socket.on('rematchUpdate', ({ votes, total }) => { rematchStatus.innerText = `За реванш проголосувало: ${votes} з ${total}`; });
socket.on('newLogEntry', (logEntry) => { const li = document.createElement('li'); if (logEntry.message.includes('<span class="message-author">')) { li.classList.add('chat-message'); } li.innerHTML = `<span class="log-time">[${logEntry.timestamp}]</span> ${logEntry.message}`; gameLogList.prepend(li); });

socket.on('gameStateUpdate', (state) => {
    if (!playerId) return;
    if (!state.winner && (winnerScreen.style.display === 'block' || lobbyScreen.style.display === 'block')) { winnerScreen.style.display = 'none'; lobbyScreen.style.display = 'none'; gameScreen.style.display = 'block'; gameLogList.innerHTML = ''; }
    const isFirstDeal = !lastGameState && state.players.some(p => p.cards.length > 0);
    if (isFirstDeal) {
        animateTrumpReveal(state.trumpCard);
        setTimeout(() => { renderGame(state); }, 2000);
    } else {
        if (lastGameState) {
            if (state.table.length > lastGameState.table.length) { const lastMovePlayerId = state.turn === state.attackerId ? state.defenderId : state.attackerId; if (lastMovePlayerId && lastMovePlayerId !== playerId) { const newCard = state.table[state.table.length - 1]; animateOpponentPlay(newCard, lastMovePlayerId); } }
            state.players.forEach((player) => { const oldPlayerState = lastGameState.players.find(p => p.id === player.id); if (oldPlayerState && player.cards.length > oldPlayerState.cards.length) { animateCardDraw(player.id, player.cards.length - oldPlayerState.cards.length); } });
        }
        renderGame(state);
    }
    lastGameState = state;
});

function playSound(soundFile) { try { new Audio(`/sounds/${soundFile}`).play(); } catch(e) {} }
function animateTrumpReveal(trumpCard) { if (!trumpCard) return; centerAnimationContainer.innerHTML = `<div class="flipper"><div class="front card card-back"></div><div class="back">${createCardDiv(trumpCard).outerHTML}</div></div>`; const flipper = centerAnimationContainer.querySelector('.flipper'); setTimeout(() => flipper.classList.add('flipped'), 100); setTimeout(() => { flipper.style.transition = 'opacity 0.5s, transform 0.5s'; flipper.style.opacity = '0'; flipper.style.transform = 'scale(0.8)'; setTimeout(() => centerAnimationContainer.innerHTML = '', 500); }, 1500); }
function animateCardDraw(targetPlayerId, count) { const deckArea = document.getElementById('deck-area'); const targetHand = (targetPlayerId === playerId) ? document.getElementById('player-cards') : document.querySelector(`.opponent[data-player-id="${targetPlayerId}"] .card-hand`); if (!deckArea || !targetHand) return; const deckRect = deckArea.getBoundingClientRect(); const handRect = targetHand.getBoundingClientRect(); for (let i = 0; i < count; i++) { const delay = i * 100; const dummyCard = document.createElement('div'); dummyCard.className = 'card card-back animated-card'; document.body.appendChild(dummyCard); dummyCard.style.transform = `translate(${deckRect.left}px, ${deckRect.top}px)`; setTimeout(() => { const targetX = handRect.left + (handRect.width / 2) - 45; const targetY = handRect.top + (handRect.height / 2) - 63; dummyCard.style.transform = `translate(${targetX}px, ${targetY}px) rotate(${Math.random() * 10 - 5}deg)`; setTimeout(() => dummyCard.remove(), 500); }, delay); } }
function animateOpponentPlay(card, opponentId) { playSound('play.mp3'); const opponentDiv = document.querySelector(`.opponent[data-player-id="${opponentId}"]`); const tableRect = document.getElementById('game-table').getBoundingClientRect(); if (!opponentDiv) return; const handRect = opponentDiv.getBoundingClientRect(); const dummyCard = createCardDiv(card); dummyCard.classList.add('animated-card'); document.body.appendChild(dummyCard); const startX = handRect.left + (handRect.width / 2) - 45; const startY = handRect.top + (handRect.height / 2) - 63; dummyCard.style.transform = `translate(${startX}px, ${startY}px)`; setTimeout(() => { const targetX = tableRect.left + (tableRect.width / 2) - 45 + (Math.random() * 40 - 20); const targetY = tableRect.top + (tableRect.height / 2) - 63 + (Math.random() * 40 - 20); dummyCard.style.transform = `translate(${targetX}px, ${targetY}px) rotate(${Math.random() * 20 - 10}deg)`; setTimeout(() => dummyCard.remove(), 500); }, 50); }
function renderGame(state) {
    if (state.winner) { return displayWinner(state.winner); }
    const me = state.players.find(p => p.id === playerId);
    if (!me) { return; }
    const trumpSuitSpan = `<span class="card-suit-${state.trumpSuit?.toLowerCase()}">${state.trumpSuit || '?'}</span>`;
    trumpCardDisplay.innerHTML = `Козир: ${trumpSuitSpan}`;
    deckCountDisplay.innerText = `${state.deckCardCount}`;
    if (state.isYourTurn) { turnStatus.innerText = me.isAttacker ? 'Ваш хід: Атакуйте!' : 'Ваш хід: Відбивайтеся!'; }
    else { turnStatus.innerText = 'Хід супротивника...'; }
    let myNameHTML = me.name;
    if (me.streak > 0) { myNameHTML += ` <span class="streak-fire">🔥${me.streak}</span>`; }
    playerName.innerHTML = myNameHTML;
    playerArea.classList.toggle('active-player', state.isYourTurn);
    updateCards(playerCards, me.cards, true, state);
    const myIndex = state.players.findIndex(p => p.id === playerId);
    const opponentsContainer = document.getElementById('opponents-container');
    opponentsContainer.innerHTML = '';
    state.players.forEach((player, index) => {
        if (player.id === playerId) return;
        const relativeIndex = (index - myIndex + state.players.length) % state.players.length;
        let positionClass = 'opponent-top';
        if (state.players.length === 3) { positionClass = relativeIndex === 1 ? 'opponent-right' : 'opponent-left'; }
        else if (state.players.length === 4) { if (relativeIndex === 1) positionClass = 'opponent-right'; if (relativeIndex === 2) positionClass = 'opponent-top'; if (relativeIndex === 3) positionClass = 'opponent-left'; }
        const opponentDiv = document.createElement('div');
        opponentDiv.className = `opponent ${positionClass}`;
        opponentDiv.setAttribute('data-player-id', player.id);
        opponentDiv.classList.toggle('active-player', player.id === state.turn);
        const opponentHand = document.createElement('div');
        opponentHand.className = 'card-hand';
        player.cards.forEach((card, i) => { const cardDiv = createCardDiv({ hidden: true }); cardDiv.style.setProperty('--card-index', i); opponentHand.appendChild(cardDiv); });
        let opponentNameHTML = player.name;
        if (player.streak > 0) { opponentNameHTML += ` <span class="streak-fire">🔥${player.streak}</span>`; }
        if (player.isAttacker) opponentNameHTML += ' ⚔️'; if (player.isDefender) opponentNameHTML += ' 🛡️';
        const h3 = document.createElement('h3');
        h3.innerHTML = opponentNameHTML;
        opponentDiv.appendChild(h3);
        opponentDiv.appendChild(opponentHand);
        opponentsContainer.appendChild(opponentDiv);
    });
    updateTable(state.table);
    renderActionButtons(state);
}
function renderActionButtons(state) { actionButtons.innerHTML = ''; if (state.canPass || state.canTake) { if (state.canPass) { const passBtn = document.createElement('button'); passBtn.innerText = 'Відбій'; passBtn.onclick = () => socket.emit('passTurn', { gameId }); actionButtons.appendChild(passBtn); } if (state.canTake) { const takeBtn = document.createElement('button'); takeBtn.innerText = 'Беру'; takeBtn.onclick = () => { playSound('take.mp3'); document.body.classList.add('shake-screen'); setTimeout(() => document.body.classList.remove('shake-screen'), 400); socket.emit('takeCards', { gameId }); }; actionButtons.appendChild(takeBtn); } actionButtons.classList.add('visible'); } else { actionButtons.classList.remove('visible'); } }
function showGameScreen() { welcomeScreen.style.display = 'none'; lobbyScreen.style.display = 'none'; gameScreen.style.display = 'block'; gameIdDisplay.innerText = gameId; }
function updateCards(container, newCards, isPlayer, state) {
    container.innerHTML = '';
    if (!isPlayer) { newCards.forEach((card, index) => { const cardDiv = createCardDiv({ hidden: true }); cardDiv.style.setProperty('--card-index', index); container.appendChild(cardDiv); }); return; }
    newCards.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || RANK_VALUES[a.rank] - RANK_VALUES[b.rank]);
    let playableCards = [];
    if (state) {
        const me = state.players.find(p => p.id === playerId);
        if (me) {
            if (state.isYourTurn) {
                if (me.isAttacker) {
                    if (state.table.length === 0) { playableCards = newCards; }
                    else { const tableRanks = state.table.map(c => c.rank); playableCards = newCards.filter(c => tableRanks.includes(c.rank)); }
                } else if (me.isDefender) {
                    const attackCard = state.table[state.t
