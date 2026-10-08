/* Futebol Vila Rezende — site de lista compartilhada.
 * Modo demo: dados somente deste navegador, para pré-visualização.
 * Modo real: Firebase Auth anônima + Realtime Database + regras de segurança.
 */
(() => {
  'use strict';

  const MAX = 16;
  const DEMO_KEY_PREFIX = 'futebol-vila-rezende-demo-week-';
  // Terça-feira, 06/10/2026, 00:00 em Piracicaba = 03:00 UTC.
  // O Brasil atualmente utiliza UTC-03:00 sem horário de verão.
  // Usamos a mesma âncora nas regras do Firebase para validar a semana.
  const TUESDAY_ANCHOR_MS = 1791255600000;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const currentWeekAt = timestamp => TUESDAY_ANCHOR_MS + Math.floor((timestamp - TUESDAY_ANCHOR_MS) / WEEK_MS) * WEEK_MS;
  const DEMO_USER_KEY = 'futebol-vila-rezende-demo-user-v1';
  const $ = id => document.getElementById(id);
  const form = $('signup-form');
  const input = $('player-name');
  const joinButton = $('signup-btn');
  const cancelButton = $('cancel-btn');
  const confirmButton = $('dialog-confirm');
  const modal = $('cancel-dialog');
  const status = $('connection-status');
  const connectionText = $('connection-text');

  let currentUid = null;
  let players = {};
  let connected = false;
  let busy = false;
  let configured = false;
  let mode = 'demo';
  let adapter = null;
  let toastTimer = null;
  let adminAdapter = null;
  let adminLoggedIn = false;
  let adminBusy = false;
  let serverTimeOffset = 0;
  let weekStart = currentWeekAt(Date.now());
  let demoRefresh = null;
  let firebaseReattachWeek = null;
  const getDemoKey = () => DEMO_KEY_PREFIX + weekStart;
  const getNextWeekStart = () => weekStart + WEEK_MS;
  const adminDialog = $('admin-dialog');
  const adminPassword = $('admin-password');
  const adminSettings = window.FUT_ADMIN || {};
  const adminSettingsReady = Boolean(
    adminSettings.email && adminSettings.uid &&
    !String(adminSettings.email).includes('COLE_') &&
    !String(adminSettings.uid).startsWith('COLE_')
  );

  function cleanName(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim();
  }
  function getSortedPlayers() {
    return Object.entries(players)
      .filter(([, player]) => player && typeof player.name === 'string')
      .map(([uid, player]) => ({uid, name: player.name, joinedAt: Number(player.joinedAt) || 0}))
      .sort((a, b) => a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid))
      .slice(0, MAX);
  }
  function flash(message, isError = false) {
    const toast = $('toast');
    toast.textContent = message;
    toast.className = `toast show${isError ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, 4400);
  }
  function updateStatus(message, statusType) {
    status.className = `live-status ${statusType || ''}`;
    connectionText.textContent = message;
  }
  function render() {
    const weekday = new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', day:'2-digit', month:'2-digit'}).format(new Date(weekStart));
    $('week-range-label').textContent = `reiniciada terça-feira (${weekday}), às 00:00`;
    const list = getSortedPlayers();
    const count = list.length;
    const mine = list.find(item => item.uid === currentUid) || null;
    const isFull = count >= MAX;

    $('confirmed-count').textContent = String(count);
    $('roster-badge-count').textContent = String(count);
    $('availability-label').textContent = isFull ? 'Todas as vagas preenchidas' : `${MAX - count} ${MAX - count === 1 ? 'vaga disponível' : 'vagas disponíveis'}`;
    $('dashboard-hint').textContent = isFull ? 'Lista fechada! Aguarde alguém liberar uma vaga.' : mine ? 'Boa! Sua presença está confirmada.' : 'Seu lugar ainda está esperando por você.';
    $('progress-fill').style.width = `${(count / MAX) * 100}%`;
    $('progress-track').setAttribute('aria-valuenow', String(count));

    const roster = $('player-list');
    roster.replaceChildren();
    for (let i = 0; i < MAX; i++) {
      const player = list[i];
      const slot = document.createElement('li');
      slot.className = `player-slot${player ? ' filled' : ''}${player && player.uid === currentUid ? ' mine' : ''}`;

      const number = document.createElement('span');
      number.className = 'slot-number';
      number.textContent = String(i + 1).padStart(2, '0');
      const icon = document.createElement('span');
      icon.className = 'slot-icon';
      icon.setAttribute('aria-hidden', 'true');
      if (player) {
        icon.textContent = cleanName(player.name).charAt(0).toUpperCase() || '?';
      } else {
        icon.textContent = '+';
      }
      const name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = player ? player.name : 'Vaga disponível';
      slot.append(number, icon, name);
      if (player && player.uid === currentUid) {
        const tag = document.createElement('span');
        tag.className = 'slot-you';
        tag.textContent = 'VOCÊ';
        slot.append(tag);
      }
      roster.append(slot);
    }

    $('signup-box').hidden = !!mine;
    $('registered-box').hidden = !mine;
    if (mine) {
      $('registered-name').textContent = mine.name;
      $('registered-avatar').textContent = cleanName(mine.name).charAt(0).toUpperCase() || '?';
    }

    const canJoin = connected && currentUid !== null && !busy && !isFull && !mine;
    joinButton.disabled = !canJoin;
    cancelButton.disabled = !connected || busy;
    joinButton.querySelector('span').textContent = busy ? 'Aguarde...' : !connected ? 'Conectando...' : isFull ? 'Lista completa' : 'Confirmar presença';
    if (!mine) {
      $('signup-heading').textContent = isFull ? 'Lista completa' : 'Garanta sua vaga';
    } else {
      $('signup-heading').textContent = 'Vaga garantida';
    }
    renderAdmin();
  }

  function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
  function switchWeekIfNeeded() {
    const expected = currentWeekAt(Date.now() + serverTimeOffset);
    if (expected === weekStart) return;
    weekStart = expected;
    players = {};
    if (modal.open) modal.close();
    render();
    if (mode === 'firebase' && firebaseReattachWeek) firebaseReattachWeek();
    if (mode === 'demo' && demoRefresh) demoRefresh();
    flash('Nova semana! A lista foi renovada automaticamente.');
  }
  // Atualiza mesmo com a página aberta durante a virada; ao voltar para a aba também.
  setInterval(switchWeekIfNeeded, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) switchWeekIfNeeded(); });

  function initializeDemo() {
    mode = 'demo';
    $('demo-banner').hidden = false;
    let uid = safeStorageGet(DEMO_USER_KEY);
    if (!uid) {
      uid = `demo-${crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()}`;
      safeStorageSet(DEMO_USER_KEY, uid);
    }
    currentUid = uid;
    function refresh() {
      try {
        const obj = JSON.parse(safeStorageGet(getDemoKey()) || '{}');
        players = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
      } catch { players = {}; }
      render();
    }
    adapter = {
      async join(name) {
        refresh();
        if (Object.keys(players).length >= MAX) throw new Error('full');
        if (players[currentUid]) throw new Error('already-in');
        players[currentUid] = {name, joinedAt: Date.now()};
        if (!safeStorageSet(getDemoKey(), JSON.stringify(players))) throw new Error('storage');
        refresh();
      },
      async leave() {
        refresh();
        delete players[currentUid];
        if (!safeStorageSet(getDemoKey(), JSON.stringify(players))) throw new Error('storage');
        refresh();
      }
    };
    demoRefresh = refresh;
    window.addEventListener('storage', event => {
      if (event.key === getDemoKey()) refresh();
    });
    connected = true;
    updateStatus('Demonstração local', 'connected');
    refresh();
  }

  async function initializeFirebase() {
    mode = 'firebase';
    const config = window.FUT_CONFIG;
    try {
      const base = 'https://www.gstatic.com/firebasejs/12.4.0/';
      const [firebaseApp, firebaseAuth, firebaseDatabase] = await Promise.all([
        import(base + 'firebase-app.js'),
        import(base + 'firebase-auth.js'),
        import(base + 'firebase-database.js')
      ]);
      const app = firebaseApp.initializeApp(config);
      const auth = firebaseAuth.getAuth(app);
      const db = firebaseDatabase.getDatabase(app);
      // Cada terça-feira abre uma nova lista; nomes da semana anterior não reaparecem.
      // O Firebase aplica a semana vigente nas regras; a interface controla 16 vagas, não é um limite rígido no servidor.
      let stopWeekListener = null;
      const attachWeekListener = () => {
        if (stopWeekListener) stopWeekListener();
        const targetWeek = weekStart;
        const playersRef = firebaseDatabase.ref(db, `weeks/${targetWeek}/players`);
        stopWeekListener = firebaseDatabase.onValue(playersRef, snapshot => {
          if (weekStart !== targetWeek) return;
          const value = snapshot.val();
          players = value && typeof value === 'object' ? value : {};
          render();
        }, err => {
          if (weekStart !== targetWeek) return;
          console.error('Falha ao ler a lista da semana:', err);
          dbAvailable = false;
          syncConnectivity();
          flash('Sem permissão para ler a lista desta semana. Atualize as regras do Firebase.', true);
        });
      };
      firebaseReattachWeek = attachWeekListener;
      let authAvailable = false;
      let dbAvailable = false;
      const syncConnectivity = () => {
        connected = authAvailable && dbAvailable;
        updateStatus(connected ? 'Ao vivo' : 'Sem conexão', connected ? 'connected' : 'offline');
        render();
      };

      firebaseDatabase.onValue(firebaseDatabase.ref(db, '.info/connected'), snapshot => {
        dbAvailable = snapshot.val() === true;
        syncConnectivity();
      });
      firebaseDatabase.onValue(firebaseDatabase.ref(db, '.info/serverTimeOffset'), snapshot => {
        serverTimeOffset = Number(snapshot.val()) || 0;
        switchWeekIfNeeded();
      });
      attachWeekListener();

      firebaseAuth.onAuthStateChanged(auth, async user => {
        if (user) {
          currentUid = user.uid;
          authAvailable = true;
          syncConnectivity();
          return;
        }
        currentUid = null;
        authAvailable = false;
        syncConnectivity();
        try {
          await firebaseAuth.signInAnonymously(auth);
        } catch (err) {
          console.error('Falha na autenticação:', err);
          flash('Não foi possível entrar. Ative a autenticação anônima no Firebase.', true);
        }
      });

      // Uma segunda instância isola o login do organizador do UID anônimo do jogador.
      // A senha nunca fica no HTML ou JavaScript: o Firebase Auth a verifica.
      const adminApp = firebaseApp.initializeApp(config, 'futebol-vila-rezende-admin');
      const adminAuth = firebaseAuth.getAuth(adminApp);
      const adminDb = firebaseDatabase.getDatabase(adminApp);
      await firebaseAuth.setPersistence(adminAuth, firebaseAuth.inMemoryPersistence);
      adminAdapter = {
        async login(password) {
          const credential = await firebaseAuth.signInWithEmailAndPassword(adminAuth, adminSettings.email, password);
          if (credential.user.uid !== adminSettings.uid) {
            await firebaseAuth.signOut(adminAuth);
            throw new Error('not-authorized-admin');
          }
        },
        async remove(uid) {
          if (!adminAuth.currentUser || adminAuth.currentUser.uid !== adminSettings.uid) {
            throw new Error('not-authorized-admin');
          }
          switchWeekIfNeeded();
          await firebaseDatabase.remove(firebaseDatabase.ref(adminDb, `weeks/${weekStart}/players/${uid}`));
        },
        async logout() { if (adminAuth.currentUser) await firebaseAuth.signOut(adminAuth); }
      };
      adapter = {
        async join(name) {
          switchWeekIfNeeded();
          await firebaseDatabase.set(firebaseDatabase.ref(db, `weeks/${weekStart}/players/${currentUid}`), {
            name,
            joinedAt: firebaseDatabase.serverTimestamp()
          });
        },
        async leave() {
          switchWeekIfNeeded();
          await firebaseDatabase.remove(firebaseDatabase.ref(db, `weeks/${weekStart}/players/${currentUid}`));
        }
      };
      updateStatus('Conectando', '');
      renderAdmin();
    } catch (err) {
      console.error('Falha na inicialização do Firebase:', err);
      updateStatus('Erro de conexão', 'offline');
      flash('Não foi possível iniciar o Firebase. Confira a configuração e sua conexão.', true);
    }
  }

  function normalizeError(error, verb) {
    const count = Object.keys(players).length;
    if (String(error?.message || '').includes('full') || (verb === 'join' && count >= MAX)) return 'As 16 vagas foram preenchidas. Aguarde alguém sair.';
    if (String(error?.message || '').includes('already-in')) return 'Seu nome já está na lista.';
    if (String(error?.message || '').includes('storage')) return 'O navegador não permitiu salvar os dados de demonstração.';
    if (error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied') return `Não foi possível ${verb === 'join' ? 'confirmar sua vaga' : 'remover seu nome'}. Confira se a lista está cheia ou se as regras do Firebase estão corretas.`;
    return 'Ocorreu um erro. Confira sua conexão e tente novamente.';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = cleanName(input.value);
    if (name.length < 2 || name.length > 40) {
      flash('Digite um nome entre 2 e 40 caracteres.', true);
      input.focus();
      return;
    }
    switchWeekIfNeeded();
    if (!connected || !adapter || busy) return;
    if (getSortedPlayers().length >= MAX) { flash('Lista completa! Espere uma vaga liberar.', true); return; }
    if (players[currentUid]) { flash('Você já está inscrito.', true); return; }
    busy = true;
    render();
    try {
      await adapter.join(name);
      input.value = '';
      flash(mode === 'demo' ? 'Inscrição salva no modo demonstração.' : 'Você está confirmado! Bola pra frente.');
    } catch (error) {
      console.error('Erro ao entrar:', error);
      flash(normalizeError(error, 'join'), true);
    } finally {
      busy = false;
      render();
    }
  });

  cancelButton.addEventListener('click', () => {
    if (busy || !players[currentUid]) return;
    if (typeof modal.showModal === 'function') modal.showModal();
    else if (window.confirm('Deseja liberar sua vaga?')) cancelRegistration();
  });
  $('dialog-back').addEventListener('click', () => modal.close());
  confirmButton.addEventListener('click', cancelRegistration);
  async function cancelRegistration() {
    switchWeekIfNeeded();
    if (!connected || busy || !players[currentUid] || !adapter) return;
    busy = true;
    confirmButton.disabled = true;
    render();
    try {
      await adapter.leave();
      modal.close();
      flash('Sua vaga foi liberada com sucesso.');
    } catch (error) {
      console.error('Erro ao sair:', error);
      flash(normalizeError(error, 'leave'), true);
    } finally {
      busy = false;
      confirmButton.disabled = false;
      render();
    }
  }
  function adminMessage(text, error = false) {
    const message = $('admin-message');
    message.textContent = text;
    message.className = `admin-message${error ? ' admin-message-error' : ''}`;
  }

  function renderAdmin() {
    const loginArea = $('admin-login-area');
    const manageArea = $('admin-manage-area');
    if (!loginArea || !manageArea) return;
    loginArea.hidden = adminLoggedIn;
    manageArea.hidden = !adminLoggedIn;
    $('admin-setup-note').hidden = configured && adminSettingsReady;
    $('admin-login-form').hidden = !(configured && adminSettingsReady);
    $('admin-login-btn').disabled = adminBusy || !adminAdapter;
    $('admin-login-btn').textContent = adminBusy && !adminLoggedIn ? 'Verificando...' : 'Entrar no painel';
    $('admin-logout-btn').disabled = adminBusy;
    if (!adminLoggedIn) return;

    const list = getSortedPlayers();
    const parent = $('admin-players');
    parent.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = 'Nenhum jogador inscrito no momento.';
      parent.append(empty);
    }
    for (const player of list) {
      const item = document.createElement('div');
      item.className = 'admin-player';
      const identity = document.createElement('div');
      identity.className = 'admin-player-identity';
      const avatar = document.createElement('span');
      avatar.className = 'admin-player-avatar';
      avatar.textContent = cleanName(player.name).charAt(0).toUpperCase() || '?';
      const label = document.createElement('span');
      label.textContent = player.name;
      identity.append(avatar, label);
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'admin-remove';
      removeButton.textContent = 'Excluir';
      removeButton.disabled = adminBusy || !connected;
      removeButton.setAttribute('aria-label', `Excluir ${player.name} da lista`);
      removeButton.addEventListener('click', () => { void removeAdminPlayer(player); });
      item.append(identity, removeButton);
      parent.append(item);
    }
  }

  async function endAdminSession() {
    adminLoggedIn = false;
    adminPassword.value = '';
    renderAdmin();
    if (adminAdapter) {
      try { await adminAdapter.logout(); }
      catch (err) { console.error('Falha ao encerrar acesso de administrador:', err); }
    }
  }

  $('admin-open-btn').addEventListener('click', () => {
    adminMessage('');
    renderAdmin();
    adminDialog.showModal();
    if (configured && adminSettingsReady && !adminLoggedIn) adminPassword.focus();
  });
  $('admin-close-btn').addEventListener('click', () => adminDialog.close());
  adminDialog.addEventListener('close', () => { void endAdminSession(); });
  $('admin-login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (adminBusy || !adminSettingsReady || !adminAdapter) {
      adminMessage('O acesso ainda não foi configurado ou o Firebase não está pronto.', true);
      return;
    }
    const password = adminPassword.value;
    if (!password) return;
    adminBusy = true;
    adminMessage('');
    renderAdmin();
    try {
      await adminAdapter.login(password);
      if (!adminDialog.open) { await endAdminSession(); return; }
      adminLoggedIn = true;
      adminPassword.value = '';
      adminMessage('Acesso autorizado. Você pode remover jogadores.');
    } catch (err) {
      console.error('Acesso administrativo negado:', err.code || err.message);
      adminMessage(err.message === 'not-authorized-admin'
        ? 'Esta conta não tem permissão de administrador. Confira o UID configurado.'
        : 'Senha incorreta ou acesso não habilitado. Confira a configuração do Firebase.', true);
    } finally {
      adminBusy = false;
      renderAdmin();
    }
  });

  async function removeAdminPlayer(player) {
    switchWeekIfNeeded();
    if (!adminLoggedIn || !adminAdapter || adminBusy || !connected || !players[player.uid]) return;
    if (!window.confirm(`Excluir ${player.name} da lista? A vaga ficará disponível imediatamente.`)) return;
    adminBusy = true;
    adminMessage('Removendo jogador...');
    renderAdmin();
    try {
      await adminAdapter.remove(player.uid);
      adminMessage(`${player.name} foi removido. Vaga liberada.`);
      flash(`${player.name} foi removido da lista.`);
    } catch (err) {
      console.error('Falha ao excluir jogador:', err);
      adminMessage('Não foi possível remover. Verifique o UID nas regras do Realtime Database e sua conexão.', true);
    } finally {
      adminBusy = false;
      renderAdmin();
    }
  }
  $('admin-logout-btn').addEventListener('click', async () => {
    if (adminBusy) return;
    adminBusy = true;
    await endAdminSession();
    adminBusy = false;
    adminMessage('Acesso encerrado.');
    renderAdmin();
  });

  $('share-btn').addEventListener('click', async () => {
    const url = location.href.split('#')[0].split('?')[0];
    try {
      if (navigator.share && mode !== 'demo') {
        await navigator.share({title: 'Futebol Vila Rezende — Lista de jogadores', text: 'Vai jogar? Confirme sua presença no Futebol Vila Rezende:', url});
      } else if (navigator.clipboard && location.protocol !== 'file:') {
        await navigator.clipboard.writeText(url);
        flash(mode === 'demo' ? 'Link copiado. Configure o Firebase antes de compartilhar de verdade.' : 'Link copiado! Manda no grupo.');
      } else {
        flash('Abra o site publicado para compartilhar o link.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') flash('Não foi possível compartilhar agora.', true);
    }
  });

  render();
  const config = window.FUT_CONFIG || {};
  configured = Boolean(config.apiKey && !String(config.apiKey).startsWith('COLE_') && config.projectId && config.databaseURL && String(config.databaseURL).startsWith('https://'));
  if (configured) initializeFirebase();
  else initializeDemo();
})();
