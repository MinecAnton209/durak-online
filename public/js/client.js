const socket = io({
    transports: ['websocket'] 
});

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

let playerId = null; let gameId = null; let lastGameState = null;

function copyLink(inputElement, buttonElement) { if (!inputElement || !buttonElement) return; const textToCopy = inputElement.value; if (!textToCopy) return; navigator.clipboard.writeText(textToCopy).then(() => { const originalIcon = buttonElement.innerHTML; buttonElement.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`; setTimeout(() => { buttonElement.innerHTML = originalIcon; }, 2000); }).catch(err => { console.error('Не вдалося скопіювати текст: ', err); inputElement.select(); document.execCommand('copy'); }); }

const urlParams = new URLSearchParams(window.location.search);
const joinGameId = urlParams.get('gameId')?.toUpperCase();
if (joinGameId) { document.getElementById('join-game-section').style.display = 'block'; gameId = joinGameId; }
createGameBtn.addEventListener('click', () => { const playerNameValue = playerNameInput.value; if (!playerNameValue) { errorMessage.innerText = "Будь ласка, введіть ім'я."; return; } const settings = { playerName: playerNameValue, deckSize: parseInt(document.getElementById('deckSize').value, 10), maxPlayers: parseInt(document.getElementById('maxPlayers').value, 10), customId: document.getElementById('customGameId').value.trim().toUpperCase() }; socket.emit('createGame', settings); });
joinGameBtn.addEventListener('click', () => { const playerNameValue = playerNameInput.value; if (!playerNameValue) { errorMessage.innerText = "Будь ласка, введіть ім'я."; return; } socket.emit('joinGame', { gameId, playerName: playerNameValue }); });
rematchBtn.addEventListener('click', () => { socket.emit('requestRematch', { gameId }); rematchBtn.disabled = true; rematchBtn.innerText = 'Очікуємо на інших...'; });
startGameBtn.addEventListener('click', () => { socket.emit('forceStartGame', { gameId }); });
copyLobbyLinkBtn.addEventListener('click', () => copyLink(lobbyInviteLink, copyLobbyLinkBtn));
copyLinkBtn.addEventListener('click', () => copyLink(inviteLink, copyLinkBtn));

socket.on('gameCreated', (data) => { gameId = data.gameId; playerId = data.playerId; welcomeScreen.style.display = 'none'; lobbyScreen.style.display = 'block'; lobbyGameId.innerText = gameId; const link = `${window.location.origin}?gameId=${gameId}`; lobbyInviteLink.value = link; inviteLink.value = link; socket.emit('getLobbyState', { gameId }); });
socket.on('joinSuccess', (data) => { playerId = data.playerId; gameId = data.gameId; welcomeScreen.style.display = 'none'; lobbyScreen.style.display = 'block'; lobbyGameId.innerText = gameId; const link = `${window.location.origin}?gameId=${gameId}`; lobbyInviteLink.value = link; inviteLink.value = link; socket.emit('getLobbyState', { gameId }); });
socket.on('playerJoined', () => { if(gameId) socket.emit('getLobbyState', { gameId }); });
socket.on('lobbyStateUpdate', ({ players, maxPlayers, hostId }) => { playerList.innerHTML = ''; let hostName = ''; players.forEach(player => { const li = document.createElement('li'); let playerLabel = player.name; if (player.id === hostId) { playerLabel += ' 👑 (Хост)'; hostName = player.name; } li.textContent = playerLabel; playerList.appendChild(li); }); lobbyStatus.innerText = `Очікуємо на гравців... (${players.length}/${maxPlayers})`; if (playerId === hostId) { hostControls.style.display = 'block'; if (players.length >= 2) { startGameBtn.disabled = false; startGameBtn.innerText = `Почати гру (${players.length})`; } else { startGameBtn.disabled = true; startGameBtn.innerText = 'Потрібно більше гравців'; } } else { hostControls.style.display = 'none'; lobbyStatus.innerText = `Очікуємо, поки ${hostName || 'хост'} почне гру... (${players.length}/${maxPlayers})`; } });
socket.on('error', (message) => { errorMessage.style.display = 'block'; errorMessage.innerText = message; welcomeScreen.classList.add('shake'); setTimeout(() => welcomeScreen.classList.remove('shake'), 500); });
socket.on('invalidMove', ({ reason }) => { errorToast.innerText = reason; errorToast.classList.add('visible'); const flyingCard = document.querySelector('.card.animate-play'); if (flyingCard) { flyingCard.classList.remove('animate-play'); flyingCard.classList.add('shake-card'); setTimeout(() => flyingCard.classList.remove('shake-card'), 400); } setTimeout(() => errorToast.classList.remove('visible'), 3000); });
socket.on('rematchUpdate', ({ votes, total }) => { rematchStatus.innerText = `За реванш проголосувало: ${votes} з ${total}`; });

socket.on('gameStateUpdate', (state) => {
    if (!playerId) return;
    if (!state.winner && (winnerScreen.style.display === 'block' || lobbyScreen.style.display === 'block')) { winnerScreen.style.display = 'none'; lobbyScreen.style.display = 'none'; gameScreen.style.display = 'block'; }
    const isFirstDeal = !lastGameState && state.players.some(p => p.cards.length > 0);
    if (isFirstDeal) {
        animateTrumpReveal(state.trumpCard);
        setTimeout(() => { renderGame(state); lastGameState = state; }, 2000);
    } else {
        if (lastGameState && state.table.length > lastGameState.table.length) {
            const lastMovePlayerId = state.turn === state.attackerId ? state.defenderId : state.attackerId;
            if (lastMovePlayerId && lastMovePlayerId !== playerId) {
                const newCard = state.table[state.table.length - 1];
                animateOpponentPlay(newCard, lastMovePlayerId);
            }
        }
        renderGame(state);
    }
    lastGameState = state;
});

function playSound(soundFile) { try { new Audio(`/sounds/${soundFile}`).play(); } catch(e) {} }
function animateTrumpReveal(trumpCard) { if (!trumpCard) return; centerAnimationContainer.innerHTML = `<div class="flipper"><div class="front card card-back"></div><div class="back">${createCardDiv(trumpCard).outerHTML}</div></div>`; const flipper = centerAnimationContainer.querySelector('.flipper'); setTimeout(() => flipper.classList.add('flipped'), 100); setTimeout(() => { flipper.style.transition = 'opacity 0.5s, transform 0.5s'; flipper.style.opacity = '0'; flipper.style.transform = 'scale(0.8)'; setTimeout(() => centerAnimationContainer.innerHTML = '', 500); }, 1500); }
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
    playerName.innerText = me.name;
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
        updateCards(opponentHand, player.cards, false, state);
        opponentDiv.innerHTML = `<h3>${player.name} ${player.isAttacker ? '⚔️' : ''} ${player.isDefender ? '🛡️' : ''}</h3>`;
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
    if (!isPlayer) { newCards.forEach((card, index) => { const cardDiv = createCardDiv(card); cardDiv.style.setProperty('--card-index', index); container.appendChild(cardDiv); }); return; }
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
                 const tableRanks = state.table.map(c => c.rank); playableCards = newCards.filter(c => tableRanks.includes(c.rank));
            }
        }
    }
    newCards.forEach((card, index) => {
        const cardDiv = createCardDiv(card); cardDiv.style.setProperty('--card-index', index);
        if (playableCards.some(pc => pc.rank === card.rank && pc.suit === card.suit)) { cardDiv.classList.add('playable'); }
        cardDiv.addEventListener('click', () => handleCardClick(card, cardDiv));
        container.appendChild(cardDiv);
    });
}
function updateTable(newTableCards) { const gameTable = document.getElementById('game-table'); if (lastGameState && lastGameState.table.length > 0 && newTableCards.length === 0) { if (lastGameState.lastAction !== 'take') { playSound('pass.mp3'); } const wasTaken = lastGameState.lastAction === 'take'; Array.from(gameTable.children).forEach((cardDiv, i) => { cardDiv.classList.add(wasTaken ? 'animate-take' : 'animate-discard'); cardDiv.style.setProperty('--card-index', i); }); setTimeout(() => gameTable.innerHTML = '', 500); return; } gameTable.innerHTML = ''; newTableCards.forEach(card => { const cardDiv = createCardDiv(card); gameTable.appendChild(cardDiv); }); }
function canBeat(attackCard, defendCard, trumpSuit) { if (!attackCard || !defendCard || !trumpSuit) return false; const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }; if (attackCard.suit === defendCard.suit) { return RANK_VALUES[defendCard.rank] > RANK_VALUES[attackCard.rank]; } return defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit; }
function createCardDiv(card) { const cardDiv = document.createElement('div'); cardDiv.className = 'card'; if (card.hidden) { cardDiv.classList.add('card-back'); } else { const rankSpan = document.createElement('span'); rankSpan.className = 'rank'; rankSpan.textContent = card.rank; const suitSpan = document.createElement('span'); suitSpan.className = 'suit'; suitSpan.textContent = card.suit; if (card.suit === '♥' || card.suit === '♦') { cardDiv.classList.add('red'); } else { cardDiv.classList.add('black'); } if (card.rank) rankSpan.setAttribute('data-rank', card.rank); cardDiv.appendChild(rankSpan); cardDiv.appendChild(suitSpan); } return cardDiv; }
function handleCardClick(card, cardDiv) { playSound('play.mp3'); cardDiv.classList.add('animate-play'); setTimeout(() => socket.emit('makeMove', { gameId, card }), 50); }
function displayWinner(winnerData) {
    gameScreen.style.display = 'none'; winnerScreen.style.display = 'block';
    let message = ''; let showRematchButton = true;
    if (winnerData.reason) { message = winnerData.reason; showRematchButton = false; }
    else {
        const winnerNames = winnerData.winners.map(w => w.id === playerId ? 'ВИ' : w.name).join(', ');
        if (winnerData.winners.some(w => w.id === playerId)) { message = `🎉 Перемога! Переможці: ${winnerNames} 🎉`; playSound('win.mp3'); }
        else if (winnerData.loser) { message = `😞 Ви програли. Дурень: ${winnerData.loser.name}.`; playSound('lose.mp3'); }
        else { message = 'Нічия!'; }
    }
    winnerMessage.innerText = message;
    if (showRematchButton) {
        rematchBtn.style.display = 'block'; rematchStatus.style.display = 'block';
        rematchBtn.disabled = false; rematchBtn.innerText = 'Реванш';
        rematchStatus.innerText = '';
    } else {
        rematchBtn.style.display = 'none'; rematchStatus.style.display = 'none';
    }
}
const SUITS = ['♦', '♥', '♠', '♣'];
const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
