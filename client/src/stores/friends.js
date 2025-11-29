import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useSocketStore } from './socket';
import { useToastStore } from './toast';
import { useRouter } from 'vue-router';

export const useFriendsStore = defineStore('friends', () => {
  const socketStore = useSocketStore();
  const toast = useToastStore();
  const router = useRouter();

  const friends = ref([]);
  const incoming = ref([]);
  const outgoing = ref([]);
  const searchResults = ref([]);

  const searchQuery = ref('');

  const currentInvite = ref(null);

  async function fetchFriends() {
    try {
      const res = await fetch('/api/friends/');
      if (res.ok) {
        const data = await res.json();
        friends.value = data.accepted || [];
        incoming.value = data.incoming || [];
        outgoing.value = data.outgoing || [];
      }
    } catch (e) {
      console.error('Fetch friends error:', e);
    }
  }

  async function searchUsers(nickname) {
    if (nickname) {
      searchQuery.value = nickname;
    }

    const query = searchQuery.value;
    if (!query || query.length < 2) return;

    try {
      const res = await fetch(`/api/friends/search?nickname=${encodeURIComponent(query)}`);
      if (res.ok) {
        searchResults.value = await res.json();
      }
    } catch (e) {
      console.error('Search error:', e);
    }
  }

  async function sendRequest(userId) {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: userId })
      });

      if (res.ok) {
        toast.addToast('Запит надіслано!', 'success');
        fetchFriends();
        searchResults.value = searchResults.value.filter(u => u.id !== userId);
      } else {
        const err = await res.json();
        toast.addToast(err.message || 'Помилка', 'error');
      }
    } catch (e) {
      console.error(e);
      toast.addToast('Помилка з\'єднання', 'error');
    }
  }

  async function acceptRequest(userId) {
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUserId: userId })
      });

      if (res.ok) {
        toast.addToast('Заявку прийнято!', 'success');
        fetchFriends();
      }
    } catch (e) { console.error(e); }
  }

  async function removeFriend(userId) {
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId: userId })
      });

      if (res.ok) {
        toast.addToast('Видалено.', 'info');
        fetchFriends();
      }
    } catch (e) { console.error(e); }
  }

  function inviteToGame(userId, gameId) {
    if (!socketStore.socket) return;
    socketStore.emit('friend:invite', { toUserId: userId, gameId });
    toast.addToast('Запрошення надіслано!', 'success');
  }

  function initListeners() {
    const socket = socketStore.socket;
    if (!socket) return;

    socket.off('friend:receiveInvite');

    socket.on('friend:receiveInvite', (data) => {
      console.log('Invite received:', data);
      currentInvite.value = data;

      try { new Audio('/sounds/notification.mp3').play().catch(() => { }); } catch (e) { }
    });
  }

  function acceptInvite() {
    if (currentInvite.value) {
      router.push(`/game/${currentInvite.value.gameId}`);
      currentInvite.value = null;
    }
  }

  function declineInvite() {
    currentInvite.value = null;
  }

  return {
    friends, incoming, outgoing, searchResults, currentInvite, searchQuery,
    fetchFriends, searchUsers, sendRequest, acceptRequest, removeFriend,
    inviteToGame, initListeners, acceptInvite, declineInvite
  };
});
