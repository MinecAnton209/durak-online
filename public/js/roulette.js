document.addEventListener('DOMContentLoaded', () => {
    const socket = io({ transports: ['websocket'] });

    const timerLabel = document.getElementById('timer-label');
    const timerValue = document.getElementById('timer-value');
    const historyList = document.getElementById('history-list');
    const winningNumberDisplay = document.getElementById('winning-number');
    const userCoinsDisplay = document.getElementById('user-coins-display');

    const betAmountInput = document.getElementById('bet-amount-input');
    const quickBetButtons = document.querySelector('.quick-bet-buttons');
    const myBetsList = document.getElementById('my-bets-list');
    const betInfoText = document.getElementById('bet-info-text');
    const numberGrid = document.querySelector('.number-grid');
    const bettingTable = document.getElementById('betting-table');

    let myCurrentBets = [];
    let currentPhase = 'waiting';

    const numberColors = {
        0: 'green', 1: 'red', 2: 'black', 3: 'red', 4: 'black', 5: 'red', 6: 'black', 7: 'red', 8: 'black', 9: 'red',
        10: 'black', 11: 'black', 12: 'red', 13: 'black', 14: 'red', 15: 'black', 16: 'red', 17: 'black', 18: 'red',
        19: 'red', 20: 'black', 21: 'red', 22: 'black', 23: 'red', 24: 'black', 25: 'red', 26: 'black', 27: 'red',
        28: 'black', 29: 'black', 30: 'red', 31: 'black', 32: 'red', 33: 'black', 34: 'red', 35: 'black', 36: 'red'
    };
    const ROULETTE_RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

    if (numberGrid) {
        for (let i = 1; i <= 36; i++) {
            const numberCell = document.createElement('div');
            numberCell.classList.add('bet-option-num');
            numberCell.classList.add(numberColors[i]);
            numberCell.textContent = i;
            numberCell.dataset.betType = 'number';
            numberCell.dataset.betValue = i;
            numberGrid.appendChild(numberCell);
        }
    }

    socket.on('connect', () => {
        console.log('Connected to server!');
        socket.emit('roulette:getState');
    });

    socket.on('roulette:updateState', (state) => {
        console.log('State update:', state);
        currentPhase = state.phase;
        updateHistory(state.history);
        updateWinningNumber(state.winningNumber, state.phase);
        if (state.phase === 'results' && myCurrentBets.length > 0) {
            calculateAndShowResults(state.winningNumber);
        }
        if (state.phase === 'betting') {
            myCurrentBets = [];
            updateMyBetsList();
            if (betInfoText) betInfoText.textContent = i18next.t('roulette_info_place_bet');
        }
    });

    socket.on('roulette:timer', ({ timer, phase }) => {
        timerValue.innerText = timer;
        if (i18next.isInitialized) {
            if (phase === 'betting') timerLabel.innerText = i18next.t('roulette_timer_betting');
            else if (phase === 'spinning') timerLabel.innerText = i18next.t('roulette_timer_spinning');
            else if (phase === 'results') timerLabel.innerText = i18next.t('roulette_timer_results');
        }
    });

    socket.on('updateBalance', ({ coins }) => {
        if (userCoinsDisplay) userCoinsDisplay.innerText = coins;
    });

    socket.on('roulette:betAccepted', (bet) => {
        myCurrentBets.push(bet);
        updateMyBetsList();
        if (betInfoText) betInfoText.textContent = i18next.t('roulette_info_bet_accepted');
    });

    socket.on('roulette:betError', ({ messageKey }) => {
        if (betInfoText) betInfoText.textContent = i18next.t(messageKey);
    });

    if (quickBetButtons) {
        quickBetButtons.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') return;
            const amount = e.target.dataset.amount;
            if (amount === 'max') {
                betAmountInput.value = userCoinsDisplay.innerText;
            } else {
                const currentAmount = parseInt(betAmountInput.value, 10) || 0;
                betAmountInput.value = currentAmount + parseInt(amount, 10);
            }
        });
    }

    if (bettingTable) {
        bettingTable.addEventListener('click', (e) => {
            const betOption = e.target.closest('.bet-option, .bet-option-num');
            if (!betOption || currentPhase !== 'betting') return;

            const amount = parseInt(betAmountInput.value, 10);
            if (isNaN(amount) || amount <= 0) {
                if (betInfoText) betInfoText.textContent = i18next.t('roulette_error_invalid_amount');
                return;
            }

            const bet = { type: betOption.dataset.betType, value: betOption.dataset.betValue, amount: amount };
            socket.emit('roulette:placeBet', bet);
            if (betInfoText) betInfoText.textContent = i18next.t('roulette_info_bet_placed');
        });
    }

    function checkWin(winningNumber, bet) {
        const wn = parseInt(winningNumber, 10);
        const betValue = bet.value;

        switch (bet.type) {
            case 'number':
                return wn === parseInt(betValue, 10);
            case 'color':
                if (betValue === 'red') return ROULETTE_RED_NUMBERS.includes(wn);
                if (betValue === 'black') return wn !== 0 && !ROULETTE_RED_NUMBERS.includes(wn);
                return false;
            case 'even-odd':
                if (wn === 0) return false;
                if (betValue === 'even') return wn % 2 === 0;
                if (betValue === 'odd') return wn % 2 !== 0;
                return false;
            default:
                return false;
        }
    }

    function calculateAndShowResults(winningNumber) {
        let totalWin = 0;
        let totalLoss = 0;

        myCurrentBets.forEach(bet => {
            if (checkWin(winningNumber, bet)) {
                if (bet.type === 'number') totalWin += bet.amount * 36;
                else totalWin += bet.amount * 2;
            } else {
                totalLoss += bet.amount;
            }
        });

        const netResult = totalWin - totalLoss;
        if (netResult > 0) showRouletteToast(`${i18next.t('roulette_net_win_toast', { amount: netResult })}`, 'win');
        else if (netResult < 0) showRouletteToast(`${i18next.t('roulette_net_loss_toast', { amount: Math.abs(netResult) })}`, 'loss');
        else if (myCurrentBets.length > 0) showRouletteToast(i18next.t('roulette_net_draw_toast'), 'info');
    }

    function showRouletteToast(message, type = 'info') {
        const container = document.body;
        const toast = document.createElement('div');
        toast.className = `roulette-toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function updateHistory(history) {
        if (!historyList) return;
        historyList.innerHTML = '';
        history.forEach(number => {
            const numberEl = document.createElement('span');
            numberEl.className = `history-number ${numberColors[number]}`;
            numberEl.textContent = number;
            historyList.appendChild(numberEl);
        });
    }

    function updateWinningNumber(number, phase) {
        if (!winningNumberDisplay) return;
        if (phase === 'betting' || number === null) {
            winningNumberDisplay.textContent = '...';
            winningNumberDisplay.className = 'winning-number-display placeholder';
        } else {
            winningNumberDisplay.textContent = number;
            winningNumberDisplay.className = `winning-number-display ${numberColors[number]}`;
        }
    }

    function updateMyBetsList() {
        if (!myBetsList) return;
        myBetsList.innerHTML = '';
        myCurrentBets.forEach(bet => {
            const li = document.createElement('li');
            let betText = '';
            if (bet.type === 'color') {
                const colorName = i18next.t(bet.value === 'red' ? 'bet_option_red' : 'bet_option_black');
                betText = `${i18next.t('bet_type_color_simple')}: ${colorName}`;
            } else if (bet.type === 'even-odd') {
                betText = i18next.t(bet.value === 'even' ? 'bet_option_even' : 'bet_option_odd');
            } else if (bet.type === 'number') {
                betText = `${i18next.t('bet_type_number')}: ${bet.value}`;
            }
            li.textContent = `${betText} - ${bet.amount} ${i18next.t('coins_label')}`;
            myBetsList.appendChild(li);
        });
    }
});