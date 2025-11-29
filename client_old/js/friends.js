window.friendsManager = {};

document.addEventListener('DOMContentLoaded', () => {
    const friendsBtn = document.getElementById('friendsBtn');
    const friendsBtnLobby = document.getElementById('friendsBtnLobby');
    const friendsModal = document.getElementById('friends-modal');

    if ((!friendsBtn && !friendsBtnLobby) || !friendsModal) {
        return;
    }

    const closeModalBtn = document.getElementById('close-friends-modal-btn');
    const tabsContainer = friendsModal.querySelector('.tabs');
    const tabContents = friendsModal.querySelectorAll('.tab-content');

    const friendsList = document.getElementById('friends-list');
    const incomingList = document.getElementById('incoming-requests-list');
    const outgoingList = document.getElementById('outgoing-requests-list');
    const searchResultsList = document.getElementById('search-results-list');

    const findFriendInput = document.getElementById('find-friend-input');
    const findFriendBtn = document.getElementById('find-friend-btn');
    const searchMessage = document.getElementById('search-message');

    let friendsData = {
        accepted: [],
        incoming: [],
        outgoing: [],
    };

    const showFriendsToast = (message, isError = false) => {
        const toastContainer = document.getElementById('achievement-toast-container') || document.body;
        const toast = document.createElement('div');
        toast.className = 'achievement-toast friend-toast';
        if (isError) {
            toast.style.borderColor = 'var(--error-color)';
        }
        toast.innerHTML = `<div class="text"><p>${message}</p></div>`;
        toastContainer.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 4000);
    };

    const openModal = () => {
        friendsModal.style.display = 'flex';
        fetchFriends();
    };

    const closeModal = () => {
        friendsModal.style.display = 'none';
    };

    const switchTab = (tabId) => {
        tabsContainer.querySelectorAll('.tab-link').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        tabContents.forEach(content => content.classList.toggle('active', content.id === tabId));
    };

    const renderList = (listElement, data, type) => {
        const placeholder = listElement.querySelector('.empty-list-placeholder');
        listElement.innerHTML = '';

        if (data.length === 0) {
            if (placeholder) listElement.appendChild(placeholder);
            return;
        }

        data.forEach(user => {
            const li = document.createElement('li');
            li.className = 'user-list-item';
            li.dataset.userId = user.id;

            let buttonsHtml = '';

            if (type === 'friend' && user.isOnline) {
                buttonsHtml += `<button class="action-btn invite-friend-btn" title="${i18next.t('friends_invite_tooltip')}">✉️</button>`;
            }

            switch (type) {
                case 'friend':   buttonsHtml += `<button class="action-btn remove-friend-btn" title="${i18next.t('friends_remove_tooltip')}">❌</button>`; break;
                case 'incoming': buttonsHtml = `<button class="action-btn accept-request-btn" title="${i18next.t('friends_accept_tooltip')}">✅</button><button class="action-btn reject-request-btn" title="${i18next.t('friends_reject_tooltip')}">❌</button>`; break;
                case 'outgoing': buttonsHtml = `<button class="action-btn cancel-request-btn" title="${i18next.t('friends_cancel_tooltip')}">❌</button>`; break;
                case 'search':   buttonsHtml = `<button class="action-btn add-friend-btn" title="${i18next.t('friends_add_tooltip')}">+</button>`; break;
            }

            li.innerHTML = `
                <div class="user-info">
                    <span class="user-nickname ${user.isOnline ? 'online' : ''}">${user.nickname}</span>
                    <span class="user-rating">${i18next.t('rating_label')}: ${Math.round(user.rating || 1500)}</span>
                </div>
                <div class="user-actions">${buttonsHtml}</div>
            `;
            listElement.appendChild(li);
        });
    };

    const renderAllLists = () => {
        renderList(friendsList, friendsData.accepted, 'friend');
        renderList(incomingList, friendsData.incoming, 'incoming');
        renderList(outgoingList, friendsData.outgoing, 'outgoing');

        const badge = document.querySelector('#incoming-requests-tab .notification-badge');
        if (!badge) return;

        if (friendsData.incoming.length > 0) {
            badge.textContent = friendsData.incoming.length;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    };

    const handleFriendAction = async (url, method, body) => {
        try {
            const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (response.ok) {
                fetchFriends();
            } else {
                const errorData = await response.json();
                showFriendsToast(i18next.t(errorData.i18nKey || 'error_unknown'), true);
            }
        } catch (error) {
            console.error('Error performing friend action:', error);
            showFriendsToast(i18next.t('error_connection'), true);
        }
    };

    const fetchFriends = async () => {
        try {
            const response = await fetch('/api/friends/');
            if (!response.ok) {
                if (response.status !== 401) {
                    console.error(`Failed to fetch friends, status: ${response.status}`);
                }
                return;
            }
            friendsData = await response.json();
            renderAllLists();
        } catch (error) {
            console.error(error);
        }
    };

    const searchFriends = async () => {
        const nickname = findFriendInput.value.trim();
        if (nickname.length < 2) {
            searchMessage.textContent = i18next.t('friends_search_short_query');
            return;
        }
        searchMessage.textContent = i18next.t('friends_search_searching');
        try {
            const response = await fetch(`/api/friends/search?nickname=${encodeURIComponent(nickname)}`);
            if (!response.ok) throw new Error('Search request failed');
            const users = await response.json();
            renderList(searchResultsList, users, 'search');
            searchMessage.textContent = users.length === 0 ? i18next.t('friends_search_no_results') : '';
        } catch (error) {
            console.error('Error searching friends:', error);
            searchMessage.textContent = i18next.t('friends_search_error');
        }
    };

    const updateUIText = () => {
        if (!window.i18next.isInitialized) return;

        const badge = document.querySelector('#incoming-requests-tab .notification-badge');
        const badgeHTML = badge ? badge.outerHTML : `<span class="notification-badge" style="display: none;"></span>`;
        const incomingTab = tabsContainer.querySelector('[data-tab="incoming-requests-tab"]');

        friendsModal.querySelector('h2').textContent = i18next.t('friends_modal_title');
        tabsContainer.querySelector('[data-tab="friends-list-tab"]').textContent = i18next.t('friends_tab_friends');
        if (incomingTab) incomingTab.innerHTML = `${i18next.t('friends_tab_incoming')} ${badgeHTML}`;
        tabsContainer.querySelector('[data-tab="outgoing-requests-tab"]').textContent = i18next.t('friends_tab_outgoing');
        tabsContainer.querySelector('[data-tab="add-friend-tab"]').textContent = i18next.t('friends_tab_add');

        document.querySelector('#friends-list .empty-list-placeholder').textContent = i18next.t('friends_list_empty');
        document.querySelector('#incoming-requests-list .empty-list-placeholder').textContent = i18next.t('friends_incoming_empty');
        document.querySelector('#outgoing-requests-list .empty-list-placeholder').textContent = i18next.t('friends_outgoing_empty');

        findFriendInput.placeholder = i18next.t('friends_search_placeholder');
        findFriendBtn.textContent = i18next.t('friends_search_button');

        renderAllLists();
    };

    if (friendsBtn) friendsBtn.addEventListener('click', openModal);
    if (friendsBtnLobby) friendsBtnLobby.addEventListener('click', openModal);

    closeModalBtn.addEventListener('click', closeModal);
    friendsModal.addEventListener('click', (e) => { if (e.target === friendsModal) closeModal(); });
    tabsContainer.addEventListener('click', (e) => { if (e.target.classList.contains('tab-link')) switchTab(e.target.dataset.tab); });

    friendsModal.addEventListener('click', (e) => {
        const target = e.target.closest('button.action-btn');
        if (!target) return;

        const li = target.closest('.user-list-item');
        if (!li) return;
        const userId = li.dataset.userId;
        const userNickname = li.querySelector('.user-nickname').textContent;

        if (target.classList.contains('invite-friend-btn')) {
            if (!window.currentGameId) {
                showFriendsToast(i18next.t('friends_invite_not_in_lobby_error'), true);
                return;
            }
            if (window.socket) {
                window.socket.emit('friend:invite', { toUserId: userId, gameId: window.currentGameId });
                showFriendsToast(i18next.t('friends_invite_sent', { nickname: userNickname }));
                target.disabled = true;
                setTimeout(() => { if(target) target.disabled = false; }, 5000);
            }
            return;
        }

        if (target.classList.contains('remove-friend-btn')) {
            if (window.confirm(i18next.t('friends_confirm_remove', { nickname: userNickname }))) {
                handleFriendAction('/api/friends/remove', 'DELETE', { otherUserId: userId });
            }
            return;
        }

        if (target.classList.contains('reject-request-btn')) {
            if (window.confirm(i18next.t('friends_confirm_reject', { nickname: userNickname }))) {
                handleFriendAction('/api/friends/remove', 'DELETE', { otherUserId: userId });
            }
            return;
        }

        if (target.classList.contains('cancel-request-btn')) {
            handleFriendAction('/api/friends/remove', 'DELETE', { otherUserId: userId });
            return;
        }

        if (target.classList.contains('accept-request-btn')) {
            handleFriendAction('/api/friends/accept', 'POST', { fromUserId: userId });
            return;
        }

        if (target.classList.contains('add-friend-btn')) {
            handleFriendAction('/api/friends/request', 'POST', { toUserId: userId });
            target.disabled = true;
            target.textContent = '✅';
            return;
        }
    });

    findFriendBtn.addEventListener('click', searchFriends);
    findFriendInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchFriends(); });

    const handleSocketEvents = (socket) => {
        socket.on('newFriendRequest', (data) => {
            showFriendsToast(`${data.from.nickname} ${i18next.t('toast_friend_request_received')}`);
            fetchFriends();
        });

        socket.on('friendRequestAccepted', (data) => {
            showFriendsToast(`${data.by.nickname} ${i18next.t('toast_friend_request_accepted')}`);
            fetchFriends();
        });

        socket.on('friendshipRemoved', () => {
            fetchFriends();
        });
    };

    window.friendsManager.initSockets = handleSocketEvents;
    window.friendsManager.updateUIText = updateUIText;

    updateUIText();
});

if (window.i18next) {
    i18next.on('languageChanged', () => {
        if (window.friendsManager && typeof window.friendsManager.updateUIText === 'function') {
            window.friendsManager.updateUIText();
        }
    });
}