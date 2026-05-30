import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); } catch { /* nop */ } }
function safeRemove(key) { try { localStorage.removeItem(key); } catch { /* nop */ } }

export const useUserStore = defineStore('user', () => {
  const token = ref(safeGet('token') || '');
  let parsedUser = null;
  try { parsedUser = JSON.parse(safeGet('user') || 'null'); } catch { /* nop */ }
  const user = ref(parsedUser);

  const isLoggedIn = computed(() => !!token.value);
  const role = computed(() => user.value?.role || '');
  const currentSchool = computed(() => user.value?.currentSchool || null);
  const teacherSchools = computed(() => user.value?.teacherSchools || []);

  function setAuth(t, u) {
    token.value = t;
    user.value = u;
    safeSet('token', t);
    safeSet('user', JSON.stringify(u));
  }

  function setCurrentSchool(school) {
    user.value = { ...user.value, currentSchool: school };
    safeSet('user', JSON.stringify(user.value));
  }

  function logout() {
    token.value = '';
    user.value = null;
    safeRemove('token');
    safeRemove('user');
  }

  return { token, user, isLoggedIn, role, currentSchool, teacherSchools, setAuth, setCurrentSchool, logout };
});
