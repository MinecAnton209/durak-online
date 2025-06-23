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
const toggleChatBtn = document.getElementById('toggle-chat-btn');
const leaveGameBtn = document.getElementById('leaveGameBtn');
const achievementsBtn = document.getElementById('achievementsBtn');
const achievementsModal = document.getElementById('achievements-modal');
const closeAchievementsModalBtn = document.getElementById('close-achievements-modal-btn');
const achievementsList = document.getElementById('achievements-list');

const VERIFIED_BADGE_SVG = `
    <span class="verified-badge" title="Верифікований гравець">
        <svg viewBox="0 0 20 22" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" fill="#1d9bf0"></path>
        </svg>
    </span>`;
    
let playerId = null; let gameId = null; let lastGameState = null;

function copyLink(inputElement, buttonElement) { if (!inputElement || !buttonElement) return; const textToCopy = inputElement.value; if (!textToCopy) return; navigator.clipboard.writeText(textToCopy).then(() => { const originalIcon = buttonElement.innerHTML; buttonElement.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`; setTimeout(() => { buttonElement.innerHTML = originalIcon; }, 2000); }).catch(err => { console.error('Не вдалося скопіювати текст: ', err); inputElement.select(); document.execCommand('copy'); }); }
function openModal(mode) { authModal.style.display = 'flex'; authError.innerText = ''; authForm.reset(); if (mode === 'login') { modalTitle.innerHTML = i18next.t('login_modal_title'); authSubmitBtn.innerHTML = i18next.t('login_button'); authForm.dataset.mode = 'login'; } else { modalTitle.innerHTML = i18next.t('register_modal_title'); authSubmitBtn.innerHTML = i18next.t('register_button'); authForm.dataset.mode = 'register'; } }
function closeModal() { authModal.style.display = 'none'; }
function showUserProfile(user) { guestLogin.style.display = 'none'; userProfile.style.display = 'block'; let profileNameHTML = user.username; if (user.isVerified) { profileNameHTML += VERIFIED_BADGE_SVG; } if (user.streak > 0) { profileNameHTML += ` <span class="streak-fire">🔥${user.streak}</span>`; } profileUsername.innerHTML = profileNameHTML; profileWins.innerText = user.wins; profileLosses.innerText = user.losses; playerNameInput.value = user.username; playerNameInput.disabled = true; }
function showGuestLogin() { guestLogin.style.display = 'block'; userProfile.style.display = 'none'; playerNameInput.value = i18next.t('guest_default_name', { number: Math.floor(Math.random() * 1000) }); playerNameInput.disabled = false; }
window.addEventListener('DOMContentLoaded', () => {
    fetch('/check-session').then(res => res.json()).then(data => { if (data.isLoggedIn) { showUserProfile(data.user); } else { showGuestLogin(); } }).catch(error => console.error('Помилка перевірки сесії:', error));
    const urlParams = new URLSearchParams(window.location.search);
    const joinGameId = urlParams.get('gameId')?.toUpperCase();
    if (joinGameId) { document.getElementById('join-game-section').style.display = 'block'; gameId = joinGameId; }
    createGameBtn.addEventListener('click', () => { const playerNameValue = playerNameInput.value; if (!playerNameValue) { errorMessage.innerText = i18next.t('error_enter_name'); return; } const settings = { playerName: playerNameValue, deckSize: parseInt(document.getElementById('deckSize').value, 10), maxPlayers: parseInt(document.getElementById('maxPlayers').value, 10), customId: document.getElementById('customGameId').value.trim().toUpperCase() }; socket.emit('createGame', settings); });
    joinGameBtn.addEventListener('click', () => { const playerNameValue = playerNameInput.value; if (!playerNameValue) { errorMessage.innerText = i18next.t('error_enter_name'); return; } socket.emit('joinGame', { gameId, playerName: playerNameValue }); });
    rematchBtn.addEventListener('click', () => { socket.emit('requestRematch', { gameId }); rematchBtn.disabled = true; rematchBtn.innerHTML = i18next.t('rematch_waiting_button'); });
    startGameBtn.addEventListener('click', () => { socket.emit('forceStartGame', { gameId }); });
    logoutBtn.addEventListener('click', async () => { try { await fetch('/logout', { method: 'POST' }); showGuestLogin(); } catch (error) { console.error('Помилка виходу:', error); } });
    copyLobbyLinkBtn.addEventListener('click', () => copyLink(lobbyInviteLink, copyLobbyLinkBtn));
    copyLinkBtn.addEventListener('click', () => copyLink(inviteLink, copyLinkBtn));
    showLoginBtn.addEventListener('click', () => openModal('login'));
    showRegisterBtn.addEventListener('click', () => openModal('register'));
    closeModalBtn.addEventListener('click', closeModal);
    authModal.addEventListener('click', (e) => { if (e.target === authModal) closeModal(); });
    authForm.addEventListener('submit', async (e) => { e.preventDefault(); const username = authUsernameInput.value; const password = authPasswordInput.value; const mode = authForm.dataset.mode; const endpoint = (mode === 'login') ? '/login' : '/register'; authSubmitBtn.disabled = true; authError.innerText = ''; try { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }); const result = await response.json(); if (response.ok) { alert(i18next.t(result.i18nKey || 'alert_success')); closeModal(); if (result.user) { showUserProfile(result.user); } } else { authError.innerText = i18next.t(result.i18nKey || 'error_unknown'); } } catch (error) { authError.innerText = i18next.t('error_connection'); } finally { authSubmitBtn.disabled = false; } });
    showLogBtnMobile.addEventListener('click', () => gameLogContainer.classList.add('visible'));
    closeLogBtn.addEventListener('click', () => gameLogContainer.classList.remove('visible'));
    leaveGameBtn.addEventListener('click', () => {
        if (window.confirm(i18next.t('confirm_leave_general'))) {
            
            if (lastGameState && !lastGameState.winner) {
                
                if (window.confirm(i18next.t('confirm_leave_game_loss'))) {
                    window.location.reload();
                }
                
            } else {
                window.location.reload();
            }
        }
    });
    chatForm.addEventListener('submit', (e) => { e.preventDefault(); const message = chatInput.value; if (message.trim()) { socket.emit('sendMessage', { gameId, message }); chatInput.value = ''; } });
    
    toggleChatBtn.addEventListener('click', () => {
        gameLogContainer.classList.toggle('collapsed');
        localStorage.setItem('chatCollapsed', gameLogContainer.classList.contains('collapsed'));
    });

    if (localStorage.getItem('chatCollapsed') === 'true') {
        gameLogContainer.classList.add('collapsed');
    }
    async function showAchievements() {
        achievementsList.innerHTML = 'Завантаження...'; // TODO: i18n
        achievementsModal.style.display = 'flex';
    
        try {
            // Отримуємо два списки паралельно
            const [allAchievementsRes, myAchievementsRes] = await Promise.all([
                fetch('/api/achievements/all'),
                fetch('/api/achievements/my')
            ]);
    
            if (!allAchievementsRes.ok) throw new Error('Could not fetch all achievements');
            
            const allAchievements = await allAchievementsRes.json();
            let myAchievements = [];
            if (myAchievementsRes.ok) {
                myAchievements = await myAchievementsRes.json();
            }
            
            const myAchievementsMap = new Map(myAchievements.map(ach => [ach.achievement_code, ach.unlocked_at]));
    
            achievementsList.innerHTML = ''; // Очищуємо
    
            allAchievements.forEach(ach => {
                const isUnlocked = myAchievementsMap.has(ach.code);
                
                const item = document.createElement('div');
                item.className = 'achievement-item';
                item.classList.add(`rarity-${ach.rarity}`);
                if (isUnlocked) {
                    item.classList.add('unlocked');
                }
                
                // Створюємо тултіп з описом
                const description = i18next.t(ach.description_key);
                const unlockedDate = isUnlocked ? new Date(myAchievementsMap.get(ach.code)).toLocaleDateString() : '';
                item.title = `${i18next.t(ach.name_key)}\n${description}${isUnlocked ? `\nОтримано: ${unlockedDate}` : ''}`;
    
                const iconDiv = document.createElement('div');
                iconDiv.className = 'ach-icon';
                // TODO: Додати сюди CSS-іконки на основі ach.code
    
                const nameSpan = document.createElement('span');
                nameSpan.className = 'ach-name';
                nameSpan.textContent = i18next.t(ach.name_key);
                
                item.appendChild(iconDiv);
                item.appendChild(nameSpan);
                achievementsList.appendChild(item);
            });
    
        } catch (error) {
            console.error("Помилка завантаження ачівок:", error);
            achievementsList.innerHTML = 'Не вдалося завантажити досягнення.'; // TODO: i18n
        }
    }
    
    achievementsBtn.addEventListener('click', showAchievements);
    closeAchievementsModalBtn.addEventListener('click', () => achievementsModal.style.display = 'none');
    achievementsModal.addEventListener('click', (e) => {
        if (e.target === achievementsModal) {
            achievementsModal.style.display = 'none';
        }
    });
});

socket.on('gameCreated', (data) => { gameId = data.gameId; playerId = data.playerId; welcomeScreen.style.display = 'none'; lobbyScreen.style.display = 'block'; lobbyGameId.innerText = gameId; const link = `${window.location.origin}?gameId=${gameId}`; lobbyInviteLink.value = link; inviteLink.value = link; socket.emit('getLobbyState', { gameId }); });
socket.on('joinSuccess', (data) => { playerId = data.playerId; gameId = data.gameId; welcomeScreen.style.display = 'none'; lobbyScreen.style.display = 'block'; lobbyGameId.innerText = gameId; const link = `${window.location.origin}?gameId=${gameId}`; lobbyInviteLink.value = link; inviteLink.value = link; socket.emit('getLobbyState', { gameId }); });
socket.on('playerJoined', () => { if(gameId) socket.emit('getLobbyState', { gameId }); });
socket.on('lobbyStateUpdate', ({ players, maxPlayers, hostId }) => { playerList.innerHTML = ''; let hostName = ''; players.forEach(player => { const li = document.createElement('li'); let playerLabelHTML = player.name; if (player.isVerified) { playerLabelHTML += VERIFIED_BADGE_SVG; } if (player.streak > 0) { playerLabelHTML += ` <span class="streak-fire">🔥${player.streak}</span>`; } if (player.id === hostId) { playerLabelHTML += ` <span data-i18n="host_badge">👑 (Хост)</span>`; hostName = player.name; } li.innerHTML = playerLabelHTML; playerList.appendChild(li); }); if (playerId === hostId) { hostControls.style.display = 'block'; if (players.length >= 2) { startGameBtn.disabled = false; startGameBtn.innerHTML = i18next.t('start_game_button_count', { count: players.length }); } else { startGameBtn.disabled = true; startGameBtn.innerHTML = i18next.t('start_game_button_waiting'); } } else { hostControls.style.display = 'none'; lobbyStatus.innerHTML = i18next.t('lobby_waiting_for_host', { host: hostName || 'хост', count: players.length, max: maxPlayers }); } });
socket.on('error', (message) => { errorMessage.style.display = 'block'; errorMessage.innerText = i18next.t(message.i18nKey || 'error_unknown', { message: message.text }); welcomeScreen.classList.add('shake'); setTimeout(() => welcomeScreen.classList.remove('shake'), 500); });
socket.on('invalidMove', ({ reason }) => { errorToast.innerText = i18next.t(reason); errorToast.classList.add('visible'); const flyingCard = document.querySelector('.card.animate-play'); if (flyingCard) { flyingCard.classList.remove('animate-play'); flyingCard.classList.add('shake-card'); setTimeout(() => flyingCard.classList.remove('shake-card'), 400); } setTimeout(() => errorToast.classList.remove('visible'), 3000); });
socket.on('rematchUpdate', ({ votes, total }) => { rematchStatus.innerHTML = i18next.t('rematch_status', { votes, total }); });
socket.on('newLogEntry', (logEntry) => {
    const li = document.createElement('li');
    let message;
    if (logEntry.i18nKey) {
        message = i18next.t(logEntry.i18nKey, logEntry.options);
    } else {
        message = logEntry.message;
    }
    
    if (message && message.includes('<span class="message-author">')) {
        li.classList.add('chat-message');
    }
    li.innerHTML = `<span class="log-time">[${logEntry.timestamp}]</span> ${message || ''}`;
    gameLogList.prepend(li);
});

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
socket.on('achievementUnlocked', ({ code }) => {
    const name = i18next.t(`ach_${code.toLowerCase()}_name`);
    const description = i18next.t(`ach_${code.toLowerCase()}_desc`);

    const toastContainer = document.getElementById('achievement-toast-container');

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';

    const iconDiv = document.createElement('div');
    iconDiv.className = 'icon'; 
    iconDiv.innerHTML = '🏆';

    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    textDiv.innerHTML = `
        <h4 data-i18n="ach_unlocked_title">Досягнення розблоковано!</h4>
        <p>${name}</p>
    `;
    
    toast.appendChild(iconDiv);
    toast.appendChild(textDiv);
    toastContainer.appendChild(toast);
    
    playSound('achievement.mp3');

    setTimeout(() => {
        toast.remove();
    }, 5000);
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
    trumpCardDisplay.innerHTML = i18next.t('trump_card_display', { suit: trumpSuitSpan });
    deckCountDisplay.innerText = `${state.deckCardCount}`;
    if (state.isYourTurn) { 
        turnStatus.innerHTML = me.isAttacker ? i18next.t('turn_status_attack') : i18next.t('turn_status_defend');
    } else { 
        turnStatus.innerHTML = i18next.t('turn_status_opponent');
    }
    let myNameHTML = me.name;
    if (me.isVerified) { myNameHTML += VERIFIED_BADGE_SVG; }
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
        updateCards(opponentHand, player.cards, false, state, player);
        let opponentNameHTML = player.name || '...';
        if (player.isVerified) { opponentNameHTML += VERIFIED_BADGE_SVG; }
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
function renderActionButtons(state) { actionButtons.innerHTML = ''; if (state.canPass || state.canTake) { if (state.canPass) { const passBtn = document.createElement('button'); passBtn.innerHTML = i18next.t('pass_button'); passBtn.onclick = () => socket.emit('passTurn', { gameId }); actionButtons.appendChild(passBtn); } if (state.canTake) { const takeBtn = document.createElement('button'); takeBtn.innerHTML = i18next.t('take_button'); takeBtn.onclick = () => { playSound('take.mp3'); document.body.classList.add('shake-screen'); setTimeout(() => document.body.classList.remove('shake-screen'), 400); socket.emit('takeCards', { gameId }); }; actionButtons.appendChild(takeBtn); } actionButtons.classList.add('visible'); } else { actionButtons.classList.remove('visible'); } }
function showGameScreen() { welcomeScreen.style.display = 'none'; lobbyScreen.style.display = 'none'; gameScreen.style.display = 'block'; gameIdDisplay.innerText = gameId; }

function updateCards(container, newCards, isPlayer, state, player) {
    container.innerHTML = '';
    if (isPlayer) {
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
                        const attackCard = state.table[state.table.length - 1];
                        if (attackCard) { playableCards = newCards.filter(c => canBeat(attackCard, c, state.trumpSuit)); }
                    }
                } else if (!me.isAttacker && !me.isDefender && state.table.length > 0 && state.table.length % 2 === 0) {
                     const tableRanks = state.table.map(c => c.rank);
                     playableCards = newCards.filter(c => tableRanks.includes(c.rank));
                }
            }
        }
        newCards.forEach((card, index) => {
            const cardDiv = createCardDiv(card);
            cardDiv.style.setProperty('--card-index', index);
            if (playableCards.some(pc => pc.rank === card.rank && pc.suit === card.suit)) {
                cardDiv.classList.add('playable');
            }
            cardDiv.addEventListener('click', () => handleCardClick(card, cardDiv));
            container.appendChild(cardDiv);
        });
    } else {
        newCards.forEach((card, index) => {
            const cardInfo = { hidden: true, style: player.cardBackStyle };
            const cardDiv = createCardDiv(cardInfo);
            cardDiv.style.setProperty('--card-index', index);
            container.appendChild(cardDiv);
        });
    }
}
function updateTable(newTableCards) { const gameTable = document.getElementById('game-table'); if (lastGameState && lastGameState.table.length > 0 && newTableCards.length === 0) { if (lastGameState.lastAction !== 'take') { playSound('pass.mp3'); } const wasTaken = lastGameState.lastAction === 'take'; if (wasTaken) { document.body.classList.add('shake-screen'); setTimeout(() => document.body.classList.remove('shake-screen'), 400); } Array.from(gameTable.children).forEach((cardDiv, i) => { cardDiv.classList.add(wasTaken ? 'animate-take' : 'animate-discard'); cardDiv.style.setProperty('--card-index', i); }); setTimeout(() => gameTable.innerHTML = '', 500); return; } gameTable.innerHTML = ''; newTableCards.forEach(card => { const cardDiv = createCardDiv(card); gameTable.appendChild(cardDiv); }); }
function canBeat(attackCard, defendCard, trumpSuit) { if (!attackCard || !defendCard || !trumpSuit) return false; const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }; if (attackCard.suit === defendCard.suit) { return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank]; } return defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit; }
function createCardDiv(card) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    if (card.hidden) {
        cardDiv.classList.add('card-back');
        if (card.style && card.style !== 'default') {
            cardDiv.classList.add(`style-${card.style}`);
        }
    } else {
        const rankSpan = document.createElement('span');
        rankSpan.className = 'rank';
        rankSpan.textContent = card.rank;
        const suitSpan = document.createElement('span');
        suitSpan.className = 'suit';
        suitSpan.textContent = card.suit;
        if (card.suit === '♥' || card.suit === '♦') {
            cardDiv.classList.add('red');
        } else {
            cardDiv.classList.add('black');
        }
        if (card.rank) rankSpan.setAttribute('data-rank', card.rank);
        cardDiv.appendChild(rankSpan);
        cardDiv.appendChild(suitSpan);
    }
    return cardDiv;
}
function handleCardClick(card, cardDiv) { playSound('play.mp3'); cardDiv.classList.add('animate-play'); setTimeout(() => socket.emit('makeMove', { gameId, card }), 50); }
function displayWinner(winnerData) {
    gameScreen.style.display = 'none'; winnerScreen.style.display = 'block';
    let message = ''; let showRematchButton = true;
    if (winnerData.reason) { if (typeof winnerData.reason === 'object' && winnerData.reason.i18nKey) { message = i18next.t(winnerData.reason.i18nKey, winnerData.reason.options); } else { message = winnerData.reason; } showRematchButton = false; }
    else {
        const winnerNames = winnerData.winners.map(w => w.id === playerId ? i18next.t('you_in_winner_list') : w.name).join(', ');
        if (winnerData.winners.some(w => w.id === playerId)) { message = i18next.t('winner_message_win', { winners: winnerNames }); playSound('win.mp3'); }
        else if (winnerData.loser) { message = i18next.t('winner_message_lose', { loser: winnerData.loser.name }); playSound('lose.mp3'); }
        else { message = i18next.t('winner_message_draw'); }
    }
    winnerMessage.innerText = message;
    if (showRematchButton) {
        rematchBtn.style.display = 'block'; rematchStatus.style.display = 'block';
        rematchBtn.disabled = false; rematchBtn.innerHTML = i18next.t('rematch_button');
        rematchStatus.innerText = '';
    } else {
        rematchBtn.style.display = 'none'; rematchStatus.style.display = 'none';
    }
    setTimeout(() => {
        fetch('/check-session').then(res => res.json()).then(data => {
            if (data.isLoggedIn) {
                showUserProfile(data.user);
            }
        }).catch(error => console.error('Не вдалося оновити статистику:', error));
    }, 1000);
}
const SUITS = ['♦', '♥', '♠', '♣'];
const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };