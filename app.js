(function () {
  'use strict';

  const STORAGE_PROFILE = 'visa_assistant_profile';
  const STORAGE_DOCS = 'visa_assistant_documents';
  const STORAGE_USA_APPLIED = 'visa_assistant_usa_applied';

  function getUsaAppliedStorageKey() {
    return currentUserId ? STORAGE_USA_APPLIED + '_' + currentUserId : STORAGE_USA_APPLIED + '_anon';
  }

  var supabase = typeof getSupabase === 'function' ? getSupabase() : null;
  var currentUserId = null;

  function showAlert(message, title) {
    var overlay = document.getElementById('app-alert-overlay');
    var titleEl = document.getElementById('app-alert-title');
    var messageEl = document.getElementById('app-alert-message');
    var okBtn = document.getElementById('app-alert-ok');
    if (!overlay || !messageEl) return;
    if (titleEl) titleEl.textContent = title || 'Уведомление';
    messageEl.textContent = message || '';
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    if (okBtn) okBtn.focus();
  }

  (function initAppAlert() {
    var overlay = document.getElementById('app-alert-overlay');
    var okBtn = document.getElementById('app-alert-ok');
    if (!overlay || !okBtn) return;
    function closeAlert() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    okBtn.addEventListener('click', closeAlert);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeAlert();
    });
  })();

  function clearAuthForm() {
    var emailEl = document.getElementById('auth-email');
    var passwordEl = document.getElementById('auth-password');
    var confirmEl = document.getElementById('auth-password-confirm');
    if (emailEl) emailEl.value = '';
    if (passwordEl) passwordEl.value = '';
    if (confirmEl) confirmEl.value = '';
  }

  function showAuth(show) {
    var authEl = document.getElementById('auth-screen');
    var appEl = document.getElementById('app-content');
    if (authEl) {
      authEl.style.display = show ? 'flex' : 'none';
      authEl.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
    if (appEl) {
      appEl.style.display = show ? 'none' : 'block';
    }
    if (show) clearAuthForm();
  }

  function setAuthMessage(text, isError) {
    var el = document.getElementById('auth-message');
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
    el.style.color = isError ? 'var(--tb-error)' : 'var(--tb-success)';
  }

  var authMode = 'login';

  function updateAuthModeUI() {
    var confirmWrap = document.getElementById('auth-confirm-wrap');
    var confirmInput = document.getElementById('auth-password-confirm');
    if (confirmWrap && confirmInput) {
      confirmWrap.style.display = authMode === 'register' ? 'block' : 'none';
      confirmInput.required = authMode === 'register';
      confirmInput.value = '';
    }
    var submitBtn = document.getElementById('auth-submit');
    if (submitBtn) submitBtn.textContent = authMode === 'register' ? 'Создать аккаунт' : 'Войти';
    var pwd = document.getElementById('auth-password');
    if (pwd) pwd.placeholder = authMode === 'register' ? 'Придумайте пароль (мин. 6 символов)' : '••••••••';
  }

  document.querySelectorAll('.auth-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      authMode = tab.getAttribute('data-mode');
      document.querySelectorAll('.auth-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      updateAuthModeUI();
      setAuthMessage('');
    });
  });

  document.getElementById('auth-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = (document.getElementById('auth-email').value || '').trim();
    var password = (document.getElementById('auth-password').value || '');
    var confirmPassword = (document.getElementById('auth-password-confirm').value || '');
    if (!email || !password) return;
    if (password.length < 6) {
      setAuthMessage('Пароль должен быть не менее 6 символов.', true);
      return;
    }
    if (authMode === 'register') {
      if (password !== confirmPassword) {
        setAuthMessage('Пароли не совпадают. Проверьте поле «Подтвердить пароль».', true);
        return;
      }
    }
    var btn = document.getElementById('auth-submit');
    btn.disabled = true;
    setAuthMessage(authMode === 'register' ? 'Создаём аккаунт…' : 'Вход…');
    if (supabase) {
      var promise = authMode === 'register'
        ? supabase.auth.signUp({ email: email, password: password, options: { emailRedirectTo: null } })
        : supabase.auth.signInWithPassword({ email: email, password: password });
      promise
        .then(function (r) {
          if (r.error) throw r.error;
          if (authMode === 'register') {
            setAuthMessage('Аккаунт создан. Вы вошли в систему.', false);
            clearAuthForm();
            showAuth(false);
            if (document.getElementById('btn-logout')) document.getElementById('btn-logout').style.display = 'inline-flex';
            loadProfileFromSupabase();
          }
        })
        .catch(function (err) {
          var msg = err.message || (authMode === 'register' ? 'Не удалось создать аккаунт.' : 'Неверный email или пароль.');
          if (err.message && err.message.toLowerCase().indexOf('confirm') !== -1) {
            msg = 'Вход возможен только после подтверждения email. В дашборде Supabase отключите «Confirm email» в Authentication → Providers → Email.';
          }
          setAuthMessage(msg, true);
        })
        .finally(function () { btn.disabled = false; });
    } else {
      setAuthMessage('Supabase не настроен. Укажите SUPABASE_URL и SUPABASE_ANON_KEY в supabase-config.js', true);
      btn.disabled = false;
    }
  });

  document.getElementById('btn-logout').addEventListener('click', function () {
    if (supabase) supabase.auth.signOut();
    currentUserId = null;
    clearAuthForm();
    localStorage.removeItem(STORAGE_PROFILE);
    localStorage.removeItem(STORAGE_DOCS);
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(STORAGE_DOCS + '_') === 0) localStorage.removeItem(k);
      }
    } catch (_) {}
    setAuthMessage('');
    showAuth(true);
  });

  var btnBackAuth = document.getElementById('btn-back-auth');
  if (btnBackAuth) {
    btnBackAuth.addEventListener('click', function (e) {
      e.preventDefault();
      clearAuthForm();
      setAuthMessage('');
      showAuth(true);
      document.getElementById('auth-screen').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (supabase) {
    supabase.auth.onAuthStateChange(function (event, session) {
      if (session && session.user) {
        currentUserId = session.user.id;
        showAuth(false);
        setProfileToForm(loadProfile() || {});
        updateInterviewNavVisibility();
        if (document.getElementById('btn-logout')) document.getElementById('btn-logout').style.display = 'inline-flex';
        loadProfileFromSupabase();
      } else {
        currentUserId = null;
        showAuth(true);
      }
    });
    supabase.auth.getSession().then(function (_ref) {
      var data = _ref.data;
      if (data.session && data.session.user) {
        currentUserId = data.session.user.id;
        showAuth(false);
        setProfileToForm(loadProfile() || {});
        updateInterviewNavVisibility();
        if (document.getElementById('btn-logout')) document.getElementById('btn-logout').style.display = 'inline-flex';
        loadProfileFromSupabase();
      } else {
        currentUserId = null;
        showAuth(true);
      }
    });
  } else {
    showAuth(true);
  }

  function cacheProfileForm() {
    var form = document.getElementById('form-profile');
    if (!form) return;
    try {
      var profile = getProfileFromForm();
      if (profile && typeof profile === 'object') saveProfile(profile);
    } catch (_) {}
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') cacheProfileForm();
  });
  window.addEventListener('pagehide', function () {
    cacheProfileForm();
  });

  function clearProfileForm() {
    var form = document.getElementById('form-profile');
    if (!form) return;
    form.querySelectorAll('input, select').forEach(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
      else el.value = '';
    });
  }

  function prefillEmailFromAuth(user) {
    if (!user || !user.email) return;
    var form = document.getElementById('form-profile');
    if (!form) return;
    var emailInput = form.querySelector('input[name="contact.email"]');
    if (emailInput && (!emailInput.value || !emailInput.value.trim())) {
      emailInput.value = user.email;
    }
  }

  function loadProfileFromSupabase() {
    if (!supabase) return;
    supabase.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) return;
      currentUserId = user.id;
      supabase.from('profiles').select('data').eq('user_id', user.id).maybeSingle()
        .then(function (res) {
          if (res.data && res.data.data && Object.keys(res.data.data).length) {
            setProfileToForm(res.data.data);
          } else {
            var local = loadProfile();
            if (local && Object.keys(local).length) setProfileToForm(local);
          }
          prefillEmailFromAuth(user);
          if (typeof renderDocList === 'function') renderDocList();
        });
    });
  }

  function saveProfileToSupabase(profile) {
    if (!supabase) return;
    supabase.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) return;
      supabase.from('profiles').upsert({ user_id: user.id, data: profile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .then(function () {});
    });
  }

  const COUNTRY_NAMES = {
    schengen: 'Шенген',
    usa: 'США',
    uk: 'Великобритания',
    japan: 'Япония'
  };

  const VISA_TYPE_NAMES = {
    tourist: 'Туристическая',
    business: 'Деловая',
    transit: 'Транзитная'
  };

  function updateInterviewNavVisibility() {
    var link = document.getElementById('nav-link-interview');
    if (!link) return;
    try {
      link.style.display = localStorage.getItem(getUsaAppliedStorageKey()) === '1' ? '' : 'none';
    } catch (_) {
      link.style.display = 'none';
    }
  }

  // ——— Навигация ———
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function (el) {
      el.classList.remove('active');
    });
    document.querySelectorAll('.nav__link[data-screen]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-screen') === id);
    });
    var profileTrigger = document.getElementById('nav-profile-trigger');
    var dropdown = document.getElementById('nav-profile-dropdown');
    if (profileTrigger) profileTrigger.classList.toggle('active', id === 'profile' || id === 'documents');
    if (dropdown) dropdown.setAttribute('hidden', '');
    const screen = document.getElementById('screen-' + id);
    if (screen) screen.classList.add('active');
    var chatFab = document.getElementById('chat-fab');
    if (chatFab) chatFab.style.display = id === 'start' ? 'inline-flex' : 'none';
    if (id === 'profile' && supabase && typeof prefillEmailFromAuth === 'function') {
      supabase.auth.getUser().then(function (r) {
        if (r.data && r.data.user) prefillEmailFromAuth(r.data.user);
      });
    }
  }

  document.querySelectorAll('.nav__link[data-screen]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      showScreen(btn.getAttribute('data-screen'));
    });
  });

  // Выпадающее меню «Мой профиль»: открытие по клику, пункты «Личные данные» и «Документы»
  var navProfileTrigger = document.getElementById('nav-profile-trigger');
  var navProfileDropdown = document.getElementById('nav-profile-dropdown');
  if (navProfileTrigger && navProfileDropdown) {
    navProfileTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = !navProfileDropdown.hasAttribute('hidden');
      navProfileDropdown.toggleAttribute('hidden', isOpen);
      navProfileTrigger.setAttribute('aria-expanded', !isOpen);
    });
    document.querySelectorAll('.nav__dropdown-item[data-screen]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        showScreen(item.getAttribute('data-screen'));
      });
    });
    document.addEventListener('click', function () {
      navProfileDropdown.setAttribute('hidden', '');
      navProfileTrigger.setAttribute('aria-expanded', 'false');
    });
  }

  // ——— Помощник: кнопка «Помощник» открывает чат с ассистентом ———
  function openAssistantChat() {
    var chatOverlay = document.getElementById('chat-overlay');
    var startChatMessages = document.getElementById('start-chat-messages');
    var startChatInput = document.getElementById('start-chat-input');
    if (!chatOverlay) return;
    chatOverlay.classList.add('is-open');
    if (startChatMessages && startChatMessages.children.length === 0) {
      var welcome = 'Здравствуйте! Я помощник по подаче визы. Выберите страну и тип визы выше, затем нажмите «Заполнить заявку». Команды: /help — список команд, /документы, /чеклист, /шенген, /сша, /англия, /япония.';
      var div = document.createElement('div');
      div.className = 'chat-msg chat-msg--assistant';
      div.innerHTML = '<div class="chat-msg__role">Помощник</div><div class="chat-msg__text">' + welcome.replace(/\n/g, '<br>') + '</div>';
      startChatMessages.appendChild(div);
      startChatMessages.scrollTop = startChatMessages.scrollHeight;
    }
    if (startChatInput) {
      startChatInput.focus();
    }
  }

  function initStartChat() {
    var chatFab = document.getElementById('chat-fab');
    var chatOverlay = document.getElementById('chat-overlay');
    var chatClose = document.getElementById('chat-close');
    var startChatForm = document.getElementById('start-chat-form');
    var startChatMessages = document.getElementById('start-chat-messages');
    var startChatInput = document.getElementById('start-chat-input');
    if (!chatOverlay) return;
    if (chatFab) {
      chatFab.style.display = document.getElementById('screen-start') && document.getElementById('screen-start').classList.contains('active') ? 'inline-flex' : 'none';
      chatFab.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openAssistantChat();
      });
    }
    if (chatClose) chatClose.addEventListener('click', function () { chatOverlay.classList.remove('is-open'); });
    chatOverlay.addEventListener('click', function (e) { if (e.target === chatOverlay) chatOverlay.classList.remove('is-open'); });
    if (startChatForm && startChatMessages && startChatInput) {
      var getStartReply = function (text) {
        var lower = (text || '').toLowerCase().replace(/\s+/g, ' ');
        if (/\/help|\/команды|какие команды|что умеешь/.test(lower)) return 'Команды: /чеклист, /документы, /шенген, /сша, /англия, /япония, /фото, /сроки. Выберите страну выше и нажмите «Заполнить заявку».';
        if (/чеклист|что проверить|перед подачей/.test(lower)) return 'Чек-лист: паспорт (срок действия), фото по требованиям, все поля заявки, справки актуальны, бронь и страховка при необходимости.';
        if (/документы|какие документы/.test(lower)) return 'Основные: загранпаспорт, фото по формату страны, справка с работы или выписка, бронь, страховка (Шенген).';
        if (/шенген|европа/.test(lower)) return 'Шенген: паспорт, фото 3,5×4,5 см, справка, выписка, бронь, страховка от 30 000 €.';
        if (/сша|америка|usa/.test(lower)) return 'США: анкета DS-160, фото 5×5 см, загранпаспорт. Мотивационное письмо можно подготовить после экспорта.';
        if (/англия|uk|великобритания/.test(lower)) return 'UK: паспорт, фото по gov.uk, справка, выписка за 6 мес., бронь.';
        if (/япония|japan/.test(lower)) return 'Япония: приглашение или путёвка, паспорт, фото 4,5×4,5 см, справка, выписка.';
        if (/привет|здравствуй/.test(lower)) return 'Здравствуйте! Выберите страну и нажмите «Заполнить заявку». Команда /help — подсказки.';
        return 'Выберите страну назначения выше и нажмите «Заполнить заявку». Команды: /help, /документы, /чеклист.';
      };
      startChatForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = (startChatInput.value || '').trim();
        if (!text) return;
        startChatInput.value = '';
        var userDiv = document.createElement('div');
        userDiv.className = 'chat-msg chat-msg--user';
        userDiv.innerHTML = '<div class="chat-msg__text">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
        startChatMessages.appendChild(userDiv);
        var typingDiv = document.createElement('div');
        typingDiv.className = 'chat-msg chat-msg--assistant chat-msg--typing';
        typingDiv.innerHTML = '<div class="chat-msg__role">Помощник</div><div class="chat-msg__text">…</div>';
        startChatMessages.appendChild(typingDiv);
        startChatMessages.scrollTop = startChatMessages.scrollHeight;
        var reply = getStartReply(text);
        setTimeout(function () {
          typingDiv.classList.remove('chat-msg--typing');
          var textEl = typingDiv.querySelector('.chat-msg__text');
          if (textEl) textEl.innerHTML = reply.replace(/\n/g, '<br>');
          startChatMessages.scrollTop = startChatMessages.scrollHeight;
        }, 400);
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initStartChat();
      initInterviewChat();
    });
  } else {
    initStartChat();
    initInterviewChat();
  }

  function initInterviewChat() {
    var form = document.getElementById('interview-chat-form');
    var messages = document.getElementById('interview-chat-messages');
    var input = document.getElementById('interview-chat-input');
    if (!form || !messages || !input) return;
    var msgCount = 0;
    function addConsulMessage(text) {
      var div = document.createElement('div');
      div.className = 'chat-msg chat-msg--assistant';
      div.innerHTML = '<div class="chat-msg__role">Консул</div><div class="chat-msg__text">' + String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }
    if (messages.children.length === 0) {
      addConsulMessage('Здравствуйте. Я консул. Сейчас мы проведём короткое собеседование по вашей заявке на визу в США. Отвечайте кратко и по делу. Какова цель вашей поездки в США?');
    }
    function getConsulReply(userText) {
      var lower = (userText || '').toLowerCase();
      msgCount += 1;
      if (msgCount === 1 || /туризм|отдых|путешеств|посмотреть|отдых|каникулы|отпуск|tourist|travel|vacation/.test(lower)) return 'Понятно. На сколько времени планируете поездку?';
      if (msgCount === 2 || /недел|месяц|дней|день|week|month|day/.test(lower)) return 'Где будете проживать во время поездки? Отель, родственники?';
      if (msgCount === 3 || /отель|гостиниц|hotel|родственник|друзья|friend|family/.test(lower)) return 'Кто оплачивает поездку — вы или приглашающая сторона?';
      if (msgCount === 4 || /я сам|самостоятельно|сам|оплачиваю|сам плачу|за свой|приглаша|спонсор/.test(lower)) return 'Чем вы занимаетесь? Где работаете или учитесь?';
      if (msgCount === 5 || /работаю|учусь|студент|пенсионер|работодатель|company/.test(lower)) return 'Бывали ли вы раньше в США или в других странах?';
      if (msgCount === 6 || /бывал|да, был|нет, не был|первый раз|never|yes, I/.test(lower)) return 'Есть ли у вас родственники или близкие в США?';
      if (msgCount === 7 || /нет|да|есть|родственник|нет родственников/.test(lower)) return 'Спасибо. На этом собеседование завершено. В реальном консульстве решение будет принято по результатам проверки документов. Удачи.';
      return 'Понятно. Есть ли у вас ещё что-то важное, что вы хотели бы добавить?';
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (input.value || '').trim();
      if (!text) return;
      input.value = '';
      var userDiv = document.createElement('div');
      userDiv.className = 'chat-msg chat-msg--user';
      userDiv.innerHTML = '<div class="chat-msg__text">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</div>';
      messages.appendChild(userDiv);
      messages.scrollTop = messages.scrollHeight;
      var typingDiv = document.createElement('div');
      typingDiv.className = 'chat-msg chat-msg--assistant chat-msg--typing';
      typingDiv.innerHTML = '<div class="chat-msg__role">Консул</div><div class="chat-msg__text">…</div>';
      messages.appendChild(typingDiv);
      messages.scrollTop = messages.scrollHeight;
      var reply = getConsulReply(text);
      setTimeout(function () {
        typingDiv.classList.remove('chat-msg--typing');
        var textEl = typingDiv.querySelector('.chat-msg__text');
        if (textEl) textEl.innerHTML = reply.replace(/\n/g, '<br>');
        messages.scrollTop = messages.scrollHeight;
      }, 500);
    });
  }

  function applyHash() {
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (hash === 'profile' || hash === 'documents' || hash === 'start') {
      showScreen(hash);
    } else if (hash === 'interview') {
      try {
        if (localStorage.getItem(getUsaAppliedStorageKey()) === '1') {
          showScreen('interview');
        } else {
          showScreen('start');
          showAlert('Раздел «Собеседование с консулом» доступен после подачи заявки на визу в США. Выберите США, заполните заявку и нажмите «Экспорт для подачи».', 'Собеседование');
        }
      } catch (_) {
        showScreen('start');
      }
    }
  }
  window.addEventListener('hashchange', applyHash);
  if (window.location.hash) applyHash();

  // ——— Профиль: загрузка/сохранение ———
  function getProfileFromForm() {
    const form = document.getElementById('form-profile');
    const data = {};
    form.querySelectorAll('input, select').forEach(function (el) {
      const name = el.getAttribute('name');
      if (!name) return;
      const value = el.type === 'date' || el.type === 'number' ? el.value : (el.value || '').trim();
      const keys = name.split('.');
      let target = data;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!target[k]) target[k] = {};
        target = target[k];
      }
      target[keys[keys.length - 1]] = value;
    });
    return data;
  }

  function setProfileToForm(profile) {
    var form = document.getElementById('form-profile');
    if (!form) return;
    form.querySelectorAll('input, select').forEach(function (el) {
      var name = el.getAttribute('name');
      if (!name) return;
      var keys = name.split('.');
      var value = profile;
      for (var i = 0; i < keys.length && value != null; i++) {
        value = value[keys[i]];
      }
      if (value != null && value !== '') {
        el.value = value;
      } else {
        el.value = '';
      }
    });
    if (typeof syncCustomSelects === 'function') syncCustomSelects();
  }

  function syncCustomSelects() {
    document.querySelectorAll('.custom-select-wrap').forEach(function (wrap) {
      var sel = wrap.querySelector('select.custom-select-native');
      var trigger = wrap.querySelector('.custom-select-trigger__label');
      if (!sel || !trigger) return;
      var opt = sel.options[sel.selectedIndex];
      trigger.textContent = opt ? opt.textContent : '';
    });
  }

  function initCustomSelects() {
    var checkSvg = '<svg class="custom-select-option__check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    document.querySelectorAll('select.select').forEach(function (sel) {
      if (sel.closest('.custom-select-wrap') || sel.id === 'visa-type') return;
      var wrap = document.createElement('div');
      wrap.className = 'custom-select-wrap';
      sel.parentNode.insertBefore(wrap, sel);
      wrap.appendChild(sel);
      sel.classList.add('custom-select-native');
      var trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'custom-select-trigger';
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-haspopup', 'listbox');
      var opt = sel.options[sel.selectedIndex];
      trigger.innerHTML = '<span class="custom-select-trigger__label">' + (opt ? opt.textContent : '') + '</span><svg class="custom-select-trigger__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12"><path fill="currentColor" d="M6 8L1 3h10z"/></svg>';
      wrap.appendChild(trigger);
      var dropdown = document.createElement('div');
      dropdown.className = 'custom-select-dropdown';
      dropdown.setAttribute('role', 'listbox');
      for (var i = 0; i < sel.options.length; i++) {
        var o = sel.options[i];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'custom-select-option' + (o.value === sel.value ? ' custom-select-option--selected' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('data-value', o.value);
        btn.setAttribute('aria-selected', o.value === sel.value);
        btn.innerHTML = checkSvg + (o.textContent || '');
        btn.addEventListener('click', function () {
          var v = this.getAttribute('data-value');
          sel.value = v;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          wrap.querySelectorAll('.custom-select-option').forEach(function (x) {
            x.classList.remove('custom-select-option--selected');
            x.setAttribute('aria-selected', x.getAttribute('data-value') === v);
          });
          this.classList.add('custom-select-option--selected');
          wrap.querySelector('.custom-select-trigger__label').textContent = this.textContent.replace(/^\s*/, '').trim();
          wrap.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        });
        dropdown.appendChild(btn);
      }
      wrap.appendChild(dropdown);
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var open = wrap.classList.toggle('is-open');
        trigger.setAttribute('aria-expanded', open);
      });
      document.addEventListener('click', function () {
        wrap.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
      return true;
    } catch (_) {
      return false;
    }
  }

  var PROFILE_REQUIRED = [
    'contact.email',
    'preferred_country',
    'personal.last_name',
    'personal.first_name',
    'personal.birth_date',
    'personal.birth_place',
    'personal.citizenship',
    'passport.number',
    'passport.issued_at',
    'passport.expires_at',
    'contact.phone',
    'address.country',
    'address.line',
    'employment.status'
  ];

  function validateProfile(profile) {
    var missing = [];
    PROFILE_REQUIRED.forEach(function (path) {
      var keys = path.split('.');
      var v = profile;
      for (var i = 0; i < keys.length && v != null; i++) v = v[keys[i]];
      if (v == null || String(v).trim() === '') missing.push(path);
    });
    return missing;
  }

  (function initProfileFormCache() {
    var form = document.getElementById('form-profile');
    if (!form) return;
    var debounceTimer;
    function scheduleCache() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(cacheProfileForm, 800);
    }
    form.addEventListener('input', scheduleCache);
    form.addEventListener('change', scheduleCache);
  })();

  document.getElementById('form-profile').addEventListener('submit', function (e) {
    e.preventDefault();
    var profile = getProfileFromForm();
    var missing = validateProfile(profile);
    var errEl = document.getElementById('profile-validation-error');
    if (missing.length) {
      errEl.textContent = 'Заполните все обязательные поля: ' + missing.join(', ');
      errEl.style.display = 'block';
      return;
    }
    var pass = profile.passport || {};
    var issued = pass.issued_at;
    var exp = pass.expires_at;
    if (issued && exp) {
      var issuedDate = new Date(issued);
      var expectedExpiry = new Date(issuedDate.getFullYear() + 10, issuedDate.getMonth(), issuedDate.getDate());
      var expiryDate = new Date(exp);
      var sameDay = expectedExpiry.getFullYear() === expiryDate.getFullYear() &&
        expectedExpiry.getMonth() === expiryDate.getMonth() &&
        expectedExpiry.getDate() === expiryDate.getDate();
      if (!sameDay) {
        errEl.textContent = 'Срок действия загранпаспорта должен составлять 10 лет от даты выдачи. Проверьте дату окончания.';
        errEl.style.display = 'block';
        return;
      }
    }
    errEl.style.display = 'none';
    saveProfile(profile);
    if (supabase) saveProfileToSupabase(profile);
    showAlert('Профиль сохранён. Данные привязаны к вашему аккаунту.');
  });

  // Профиль подставляется только из Supabase для текущего пользователя (в loadProfileFromSupabase)

  // ——— Документы: привязка к текущему пользователю (разные профили — разные списки) ———
  function getDocumentsStorageKey() {
    return currentUserId ? STORAGE_DOCS + '_' + currentUserId : STORAGE_DOCS;
  }

  function loadDocuments() {
    try {
      var key = getDocumentsStorageKey();
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveDocuments(docs) {
    try {
      localStorage.setItem(getDocumentsStorageKey(), JSON.stringify(docs));
      return true;
    } catch (_) {
      return false;
    }
  }

  function renderDocList() {
    const docs = loadDocuments();
    const list = document.getElementById('doc-list');
    list.innerHTML = docs.map(function (d) {
      const statusClass = d.extraction_status === 'completed' ? '' : d.extraction_status === 'failed' ? 'failed' : 'pending';
      const statusText = d.extraction_status === 'completed' ? 'Готово' : d.extraction_status === 'failed' ? 'Ошибка' : 'Обработка…';
      return (
        '<li class="doc-item">' +
          '<div><div class="doc-item__name">' + escapeHtml(d.file_name) + '</div>' +
          '<div class="doc-item__type">' + escapeHtml(d.type || 'document') + '</div></div>' +
          '<span class="doc-item__status ' + statusClass + '">' + statusText + '</span>' +
          '<button type="button" class="doc-item__delete" data-id="' + escapeHtml(d.id) + '" aria-label="Удалить">×</button>' +
        '</li>'
      );
    }).join('');

    list.querySelectorAll('.doc-item__delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-id');
        const docs = loadDocuments().filter(function (d) { return d.id !== id; });
        saveDocuments(docs);
        renderDocList();
      });
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  var fileInput = document.getElementById('file-input');
  var uploadZone = document.getElementById('upload-zone');
  var docTypeSelect = document.getElementById('doc-type');

  uploadZone.addEventListener('click', function () {
    fileInput.click();
  });

  uploadZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', function () {
    uploadZone.classList.remove('dragover');
  });
  uploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) addDocument(files[0]);
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) {
      addDocument(fileInput.files[0]);
      fileInput.value = '';
    }
  });

  function setPassportScanStatus(text, isError) {
    var el = document.getElementById('passport-scan-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
    el.style.color = isError ? 'var(--tb-error)' : 'var(--tb-success)';
  }

  function parseMRZFromText(text) {
    if (!text || !text.length) return null;
    var raw = text.toUpperCase().replace(/\r/g, '\n');
    var lines = raw.split(/\n/).map(function (s) { return s.replace(/\s/g, '').replace(/[^A-Z0-9<]/g, ''); }).filter(Boolean);
    var mrzLine1 = null;
    var mrzLine2 = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.length >= 42 && line.length <= 46 && /^[A-Z0-9<]+$/.test(line)) {
        if ((line.charAt(0) === 'P' && (line.charAt(1) === '<' || line.charAt(1) === '1')) && !mrzLine1) {
          mrzLine1 = line.length >= 44 ? line.substring(0, 44) : line + '<'.repeat(44 - line.length);
        } else if (mrzLine1 && !mrzLine2) {
          mrzLine2 = line.length >= 44 ? line.substring(0, 44) : line + '<'.repeat(44 - line.length);
          break;
        }
      }
    }
    if (!mrzLine1 || !mrzLine2) {
      var flat = raw.replace(/\s/g, '').replace(/[^A-Z0-9<]/g, '');
      var match = flat.match(/P[<1][A-Z]{3}[A-Z0-9<]{35,42}([A-Z0-9<]{42,44})/);
      if (match) {
        var start = flat.indexOf(match[1]);
        if (start >= 44) {
          mrzLine1 = flat.substring(start - 44, start);
          mrzLine2 = match[1].length >= 44 ? match[1].substring(0, 44) : match[1] + '<'.repeat(44 - match[1].length);
        }
      }
    }
    if (!mrzLine1 || !mrzLine2) return null;
    if (mrzLine1.length < 44) mrzLine1 = mrzLine1 + '<'.repeat(44 - mrzLine1.length);
    if (mrzLine2.length < 44) mrzLine2 = mrzLine2 + '<'.repeat(44 - mrzLine2.length);
    var passportNumber = (mrzLine2.substring(0, 9).replace(/</g, '').replace(/O/g, '0') || '').trim();
    var birthYy = mrzLine2.substring(13, 15).replace(/O/g, '0');
    var birthMm = mrzLine2.substring(15, 17).replace(/O/g, '0');
    var birthDd = mrzLine2.substring(17, 19).replace(/O/g, '0');
    var expiryYy = mrzLine2.substring(21, 23).replace(/O/g, '0');
    var expiryMm = mrzLine2.substring(23, 25).replace(/O/g, '0');
    var expiryDd = mrzLine2.substring(25, 27).replace(/O/g, '0');
    var birthNum = parseInt(birthYy, 10);
    var birthCentury = (birthNum >= 30 && birthNum <= 99) ? '19' : '20';
    var birthDate = (birthYy && birthMm && birthDd && /^\d{2}$/.test(birthYy) && /^\d{2}$/.test(birthMm) && /^\d{2}$/.test(birthDd))
      ? birthCentury + birthYy + '-' + birthMm + '-' + birthDd : '';
    var expiryDate = (expiryYy && expiryMm && expiryDd && /^\d{2}$/.test(expiryYy) && /^\d{2}$/.test(expiryMm) && /^\d{2}$/.test(expiryDd))
      ? '20' + expiryYy + '-' + expiryMm + '-' + expiryDd : '';
    var namePart = mrzLine1.substring(5, 44);
    var nameParts = namePart.split('<<').map(function (p) { return p.replace(/</g, ' ').trim(); }).filter(Boolean);
    var lastName = nameParts[0] || '';
    var firstName = nameParts[1] || '';
    var middleName = nameParts[2] || '';
    return {
      passportNumber: passportNumber,
      birthDate: birthDate,
      expiryDate: expiryDate,
      lastName: lastName,
      firstName: firstName,
      middleName: middleName
    };
  }

  function applyParsedPassportToProfile(parsed) {
    if (!parsed) return;
    var profile = loadProfile() || {};
    profile.personal = profile.personal || {};
    profile.passport = profile.passport || {};
    if (parsed.lastName) profile.personal.last_name = parsed.lastName;
    if (parsed.firstName) profile.personal.first_name = parsed.firstName;
    if (parsed.middleName) profile.personal.middle_name = parsed.middleName;
    if (parsed.birthDate) profile.personal.birth_date = parsed.birthDate;
    if (parsed.passportNumber) profile.passport.number = parsed.passportNumber;
    if (parsed.expiryDate) profile.passport.expires_at = parsed.expiryDate;
    saveProfile(profile);
    setProfileToForm(profile);
    if (supabase && currentUserId) saveProfileToSupabase(profile);
  }

  function parsePassportImage(file, docId) {
    if (typeof Tesseract === 'undefined') {
      setPassportScanStatus('Библиотека распознавания недоступна. Проверьте подключение к интернету.', true);
      return;
    }
    setPassportScanStatus('Сканирую паспорт…');
    Tesseract.recognize(file, 'rus+eng', { logger: function () {} })
      .then(function (result) {
        var text = (result && result.data && result.data.text) ? result.data.text : '';
        var parsed = parseMRZFromText(text);
        if (parsed && (parsed.passportNumber || parsed.lastName || parsed.birthDate || parsed.expiryDate)) {
          applyParsedPassportToProfile(parsed);
          setPassportScanStatus('Данные паспорта подставлены в профиль. Проверьте «Мой профиль» и при необходимости допишите кем выдан и дату выдачи.');
        } else {
          setPassportScanStatus('Не удалось распознать зону MRZ (нижние строки паспорта). Убедитесь, что скан чёткий и содержит две строки с буквами и цифрами внизу страницы.', true);
        }
      })
      .catch(function (err) {
        setPassportScanStatus('Ошибка распознавания: ' + (err.message || 'попробуйте другой файл'), true);
      });
  }

  function addDocument(file) {
    if (file.size > 10 * 1024 * 1024) {
      showAlert('Файл больше 10 МБ.');
      return;
    }
    var docType = docTypeSelect.value;
    var isPassportScan = docType === 'passport_scan';
    var isImage = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/jpg';
    var docs = loadDocuments();
    var id = 'doc-' + Date.now();
    docs.push({
      id: id,
      file_name: file.name,
      type: docType,
      extraction_status: isPassportScan && isImage ? 'pending' : 'completed',
      created_at: new Date().toISOString()
    });
    saveDocuments(docs);
    renderDocList();
    setPassportScanStatus('');
    if (isPassportScan && isImage) {
      parsePassportImage(file, id);
      setTimeout(function () {
        docs = loadDocuments();
        var doc = docs.find(function (d) { return d.id === id; });
        if (doc) {
          doc.extraction_status = 'completed';
          saveDocuments(docs);
          renderDocList();
        }
      }, 500);
    } else {
      if (isPassportScan && !isImage) setPassportScanStatus('Для распознавания паспорта загрузите изображение (JPG или PNG).', true);
      setTimeout(function () {
        docs = loadDocuments();
        var doc = docs.find(function (d) { return d.id === id; });
        if (doc) {
          doc.extraction_status = 'completed';
          saveDocuments(docs);
          renderDocList();
        }
      }, 500);
    }
  }

  renderDocList();

  // ——— Заполнение заявки (mock) ———
  var selectedCountry = 'schengen';

  document.getElementById('country-grid').addEventListener('click', function (e) {
    var card = e.target.closest('.country-card');
    if (!card) return;
    document.querySelectorAll('.country-card').forEach(function (c) { c.classList.remove('selected'); });
    card.classList.add('selected');
    selectedCountry = card.getAttribute('data-country');
  });
  document.querySelector('.country-card[data-country="schengen"]').classList.add('selected');

  var visaTypeTrigger = document.getElementById('visa-type-trigger');
  var visaTypeDropdown = document.getElementById('visa-type-dropdown');
  var visaTypeInput = document.getElementById('visa-type');
  var visaTypeLabels = { tourist: 'Туристическая', business: 'Деловая', transit: 'Транзитная' };
  if (visaTypeTrigger && visaTypeDropdown && visaTypeInput) {
    visaTypeTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = visaTypeDropdown.classList.toggle('is-open');
      visaTypeTrigger.setAttribute('aria-expanded', isOpen);
      visaTypeDropdown.setAttribute('aria-hidden', !isOpen);
    });
    visaTypeDropdown.querySelectorAll('.visa-type-option').forEach(function (opt) {
      opt.addEventListener('click', function (e) {
        e.preventDefault();
        var value = opt.getAttribute('data-value');
        visaTypeInput.value = value;
        visaTypeTrigger.querySelector('.visa-type-trigger__label').textContent = visaTypeLabels[value] || value;
        visaTypeDropdown.classList.remove('is-open');
        visaTypeTrigger.setAttribute('aria-expanded', 'false');
        visaTypeDropdown.setAttribute('aria-hidden', 'true');
        visaTypeDropdown.querySelectorAll('.visa-type-option').forEach(function (o) {
          o.classList.remove('visa-type-option--selected');
          o.setAttribute('aria-selected', o === opt ? 'true' : 'false');
        });
        opt.classList.add('visa-type-option--selected');
      });
    });
    document.addEventListener('click', function () {
      visaTypeDropdown.classList.remove('is-open');
      visaTypeTrigger.setAttribute('aria-expanded', 'false');
      visaTypeDropdown.setAttribute('aria-hidden', 'true');
    });
  }

  var btnFill = document.getElementById('btn-fill');
  var fillResult = document.getElementById('fill-result');
  var fillLoading = document.getElementById('fill-loading');
  var filledFormEl = document.getElementById('filled-form');
  var validationBlockEl = document.getElementById('validation-block');

  btnFill.addEventListener('click', function () {
    var profile = loadProfile();
    if (!profile || !profile.personal || !profile.personal.last_name) {
      showAlert('Сначала заполните и сохраните «Мой визовый профиль».');
      showScreen('profile');
      return;
    }

    fillResult.style.display = 'none';
    fillLoading.style.display = 'block';
    btnFill.disabled = true;

    setTimeout(function () {
      fillLoading.style.display = 'none';
      fillResult.style.display = 'block';
      btnFill.disabled = false;

      var visaType = document.getElementById('visa-type').value;
      var mockFields = buildMockFilledFields(profile, selectedCountry, visaType);
      var mockValidation = buildMockValidation(profile, mockFields);

      renderFilledForm(mockFields, selectedCountry, visaType);
      renderValidation(mockValidation);
    }, 1800);
  });

  function buildMockFilledFields(profile, country, visaType) {
    var p = profile.personal || {};
    var pass = profile.passport || {};
    var contact = profile.contact || {};
    var addr = profile.address || {};
    var emp = profile.employment || {};
    return {
      surname: p.last_name || '—',
      first_name: p.first_name || '—',
      birth_date: p.birth_date || '—',
      birth_place: p.birth_place || '—',
      citizenship: p.citizenship === 'RU' ? 'Russian Federation' : (p.citizenship || '—'),
      passport_number: pass.number || '—',
      passport_issued_at: pass.issued_at || '—',
      passport_expires_at: pass.expires_at || '—',
      email: contact.email || '—',
      phone: contact.phone || '—',
      address_line: addr.line || '—',
      city: addr.city || '—',
      postal_code: addr.postal_code || '—',
      country_residence: addr.country === 'RU' ? 'Russia' : addr.country === 'BY' ? 'Belarus' : addr.country === 'KZ' ? 'Kazakhstan' : (addr.country || '—'),
      employment_status: emp.status || '—',
      employer_name: emp.employer_name || '—',
      position: emp.position || '—',
      income: emp.income_amount ? emp.income_amount + ' ' + (emp.income_currency || 'RUB') : '—'
    };
  }

  function buildMockValidation(profile, fields) {
    var pass = profile.passport || {};
    var errors = [];
    var checklist = [
      { item: 'Паспорт действителен не менее 3 месяцев после поездки', passed: true, detail: null },
      { item: 'Срок действия паспорта 10 лет', passed: true, detail: null },
      { item: 'Фото соответствует требованиям (размер, фон)', passed: true, detail: null },
      { item: 'Все обязательные поля заполнены', passed: true, detail: null },
      { item: 'Даты в формате ДД.ММ.ГГГГ где требуется', passed: true, detail: null }
    ];
    var exp = pass.expires_at;
    var issued = pass.issued_at;
    if (exp) {
      var expDate = new Date(exp);
      var inThreeMonths = new Date();
      inThreeMonths.setMonth(inThreeMonths.getMonth() + 3);
      if (expDate < inThreeMonths) {
        errors.push({ field_key: 'passport.expires_at', code: 'passport_expiry_too_soon', message: 'Срок действия паспорта должен быть не менее 3 месяцев после поездки', severity: 'blocking' });
        checklist[0].passed = false;
        checklist[0].detail = 'Проверьте дату окончания срока действия паспорта';
      }
    }
    if (issued && exp) {
      var issuedDate = new Date(issued);
      var expectedExpiry = new Date(issuedDate.getFullYear() + 10, issuedDate.getMonth(), issuedDate.getDate());
      var expiryDate = new Date(exp);
      var sameDay = expectedExpiry.getFullYear() === expiryDate.getFullYear() &&
        expectedExpiry.getMonth() === expiryDate.getMonth() &&
        expectedExpiry.getDate() === expiryDate.getDate();
      if (!sameDay) {
        errors.push({ field_key: 'passport.expires_at', code: 'passport_not_10_years', message: 'Срок действия загранпаспорта должен составлять 10 лет от даты выдачи', severity: 'blocking' });
        checklist[1].passed = false;
        checklist[1].detail = 'Укажите дату окончания срока действия на 10 лет позже даты выдачи';
      }
    }
    return {
      valid: errors.filter(function (e) { return e.severity === 'blocking'; }).length === 0,
      errors: errors,
      checklist: checklist
    };
  }

  function renderFilledForm(fields, country, visaType) {
    var labels = {
      surname: 'Фамилия',
      first_name: 'Имя',
      birth_date: 'Дата рождения',
      birth_place: 'Место рождения',
      citizenship: 'Гражданство',
      passport_number: 'Номер паспорта',
      passport_issued_at: 'Дата выдачи',
      passport_expires_at: 'Срок действия',
      email: 'Email',
      phone: 'Телефон',
      address_line: 'Адрес',
      city: 'Город',
      postal_code: 'Индекс',
      country_residence: 'Страна проживания',
      employment_status: 'Занятость',
      employer_name: 'Работодатель',
      position: 'Должность',
      income: 'Доход'
    };
    filledFormEl.innerHTML = '<p class="hint" style="margin-bottom: 16px;">' +
      COUNTRY_NAMES[country] + ', ' + VISA_TYPE_NAMES[visaType] + '. Заполнено по профилю и документам.</p>' +
      Object.keys(fields).map(function (key) {
        return (
          '<div class="filled-field">' +
            '<div class="filled-field__label">' + escapeHtml(labels[key] || key) + '</div>' +
            '<div class="filled-field__value">' + escapeHtml(String(fields[key])) + '</div>' +
          '</div>'
        );
      }).join('');
  }

  function renderValidation(result) {
    var valid = result.valid;
    validationBlockEl.className = 'validation-block ' + (valid ? 'valid' : 'invalid');
    validationBlockEl.innerHTML =
      '<div class="validation-block__title">' +
        (valid ? '✓ Проверка пройдена' : '✕ Есть ошибки') +
      '</div>' +
      (result.errors && result.errors.length
        ? '<ul class="errors-list">' +
            result.errors.map(function (e) {
              return '<li class="errors-list__item">' + escapeHtml(e.message) + '</li>';
            }).join('') +
          '</ul>'
        : '') +
      '<ul class="checklist">' +
        (result.checklist || []).map(function (c) {
          return '<li class="checklist__item ' + (c.passed ? 'passed' : 'failed') + '">' +
            escapeHtml(c.item) +
            (c.detail ? '<div class="checklist__detail">' + escapeHtml(c.detail) + '</div>' : '') +
          '</li>';
        }).join('') +
      '</ul>';
  }

  document.getElementById('btn-edit-fields').addEventListener('click', function () {
    showScreen('profile');
  });

  document.getElementById('btn-export').addEventListener('click', function () {
    var country = selectedCountry || 'schengen';
    var visaType = document.getElementById('visa-type').value;
    var profile = getProfileFromForm();
    if (!profile || !profile.personal || !profile.personal.last_name) profile = loadProfile() || {};
    var fields = buildMockFilledFields(profile, country, visaType);
    var countryName = COUNTRY_NAMES[country] || country;
    var visaTypeName = VISA_TYPE_NAMES[visaType] || visaType;
    if (typeof window.jspdf !== 'undefined') {
      try {
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF();
        doc.setFontSize(18);
        doc.text('Visa Application', 14, 20);
        doc.setFontSize(11);
        doc.text(countryName + ', ' + visaTypeName, 14, 28);
        doc.setFontSize(10);
        var labels = { surname: 'Surname', first_name: 'First name', birth_date: 'Date of birth', birth_place: 'Place of birth', citizenship: 'Citizenship', passport_number: 'Passport number', passport_issued_at: 'Date of issue', passport_expires_at: 'Expiry date', email: 'Email', phone: 'Phone', address_line: 'Address', city: 'City', postal_code: 'Postal code', country_residence: 'Country of residence', employment_status: 'Employment status', employer_name: 'Employer', position: 'Position', income: 'Income' };
        var y = 38;
        Object.keys(fields).forEach(function (k) {
          var line = (labels[k] || k) + ': ' + String(fields[k]).substring(0, 90);
          if (line.length > 90) line = line.substring(0, 87) + '...';
          doc.text(line, 14, y);
          y += 7;
        });
        var filename = 'visa-' + country + '-' + (profile.personal && profile.personal.last_name ? String(profile.personal.last_name).replace(/\s+/g, '-') : 'application') + '.pdf';
        doc.save(filename);
      } catch (e) { console.warn('PDF export failed', e); }
    }
    if (country === 'usa') {
      try { localStorage.setItem(getUsaAppliedStorageKey(), '1'); } catch (_) {}
      showAlert('Ваша заявка в обработке. В меню доступен раздел «Собеседование с консулом» для тренировки перед интервью.', 'Заявка отправлена');
    } else {
      showAlert('Ваша заявка в обработке.', 'Заявка отправлена');
    }
    try { sessionStorage.setItem('visa_export_profile', JSON.stringify(profile)); } catch (_) {}
    setTimeout(function () {
      window.location.href = 'export.html?country=' + encodeURIComponent(country) + '&visa_type=' + encodeURIComponent(visaType) + '&submitted=1';
    }, 1500);
  });

  initCustomSelects();
  initDatePickers();
})();

  function initDatePickers() {
    var form = document.getElementById('form-profile');
    if (!form) return;
    var calendarEl = document.getElementById('date-pick-calendar');
    if (!calendarEl) return;
    calendarEl.style.display = 'none';
    var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    var WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    var currentDateInput = null;
    var currentFakeInput = null;
    var viewYear = new Date().getFullYear();
    var viewMonth = new Date().getMonth();
    var pickerMode = null;

    function formatForInput(d) {
      var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }
    function formatForDisplay(str) {
      if (!str) return '';
      var parts = str.split('-');
      if (parts.length !== 3) return str;
      return parts[2] + '.' + parts[1] + '.' + parts[0];
    }
    function parseInputValue(str) {
      if (!str) return null;
      var d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }

    function syncDateDisplays() {
      form.querySelectorAll('.date-pick-wrap').forEach(function (wrap) {
        var real = wrap.querySelector('input[type="date"]');
        var fake = wrap.querySelector('.date-pick-fake');
        if (real && fake) fake.value = formatForDisplay(real.value);
      });
    }
    window.syncDateDisplays = syncDateDisplays;

    function renderCalendar() {
      var html = '<div class="date-pick-calendar__head">';
      html += '<button type="button" class="date-pick-calendar__month-btn" aria-label="Выбрать месяц">' + MONTHS[viewMonth] + '</button>';
      html += ' <button type="button" class="date-pick-calendar__year-btn" aria-label="Выбрать год">' + viewYear + ' г.</button>';
      html += '<div class="date-pick-calendar__nav"><button type="button" class="date-pick-calendar__nav-btn" data-delta="-1">‹</button><button type="button" class="date-pick-calendar__nav-btn" data-delta="1">›</button></div></div>';

      if (pickerMode === 'month') {
        html += '<div class="date-pick-calendar__picker date-pick-calendar__picker--months">';
        for (var m = 0; m < 12; m++) {
          html += '<button type="button" class="date-pick-calendar__picker-item' + (m === viewMonth ? ' date-pick-calendar__picker-item--selected' : '') + '" data-month="' + m + '">' + MONTHS[m] + '</button>';
        }
        html += '</div>';
      } else if (pickerMode === 'year') {
        var yearFrom = Math.max(1920, viewYear - 7);
        var yearTo = Math.min(2100, viewYear + 8);
        html += '<div class="date-pick-calendar__picker date-pick-calendar__picker--years">';
        for (var y = yearFrom; y <= yearTo; y++) {
          html += '<button type="button" class="date-pick-calendar__picker-item' + (y === viewYear ? ' date-pick-calendar__picker-item--selected' : '') + '" data-year="' + y + '">' + y + '</button>';
        }
        html += '</div>';
      } else {
        var first = new Date(viewYear, viewMonth, 1);
        var start = new Date(first);
        var startDay = start.getDay();
        start.setDate(start.getDate() - (startDay === 0 ? 6 : startDay - 1));
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var selected = currentDateInput && currentDateInput.value ? parseInputValue(currentDateInput.value) : null;
        if (selected) selected.setHours(0, 0, 0, 0);
        html += '<div class="date-pick-calendar__weekdays">' + WEEKDAYS.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>';
        html += '<div class="date-pick-calendar__days">';
        for (var i = 0; i < 42; i++) {
          var d = new Date(start);
          d.setDate(d.getDate() + i);
          var isOther = d.getMonth() !== viewMonth;
          var isToday = d.getTime() === today.getTime();
          var isSelected = selected && d.getTime() === selected.getTime();
          var cls = 'date-pick-calendar__day';
          if (isOther) cls += ' date-pick-calendar__day--other-month';
          if (isToday) cls += ' date-pick-calendar__day--today';
          if (isSelected) cls += ' date-pick-calendar__day--selected';
          html += '<button type="button" class="' + cls + '" data-date="' + formatForInput(d) + '">' + d.getDate() + '</button>';
        }
        html += '</div>';
        html += '<div class="date-pick-calendar__footer"><button type="button" class="date-pick-calendar__link" data-action="clear">Удалить</button><button type="button" class="date-pick-calendar__link" data-action="today">Сегодня</button></div>';
      }
      calendarEl.innerHTML = html;
      var monthBtn = calendarEl.querySelector('.date-pick-calendar__month-btn');
      var yearBtn = calendarEl.querySelector('.date-pick-calendar__year-btn');
      if (monthBtn) monthBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        pickerMode = 'month';
        renderCalendar();
      });
      if (yearBtn) yearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        pickerMode = 'year';
        renderCalendar();
      });
      calendarEl.querySelectorAll('.date-pick-calendar__nav-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (pickerMode === 'month' || pickerMode === 'year') {
            pickerMode = null;
          } else {
            var delta = parseInt(this.getAttribute('data-delta'), 10);
            viewMonth += delta;
            if (viewMonth > 11) { viewYear++; viewMonth = 0; }
            if (viewMonth < 0) { viewYear--; viewMonth = 11; }
            viewYear = Math.max(1920, Math.min(2100, viewYear));
          }
          renderCalendar();
        });
      });
      calendarEl.querySelectorAll('.date-pick-calendar__picker-item[data-month]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          viewMonth = parseInt(this.getAttribute('data-month'), 10);
          pickerMode = null;
          renderCalendar();
        });
      });
      calendarEl.querySelectorAll('.date-pick-calendar__picker-item[data-year]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          viewYear = parseInt(this.getAttribute('data-year'), 10);
          pickerMode = null;
          renderCalendar();
        });
      });
      calendarEl.querySelectorAll('.date-pick-calendar__day').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var v = this.getAttribute('data-date');
          if (currentDateInput) currentDateInput.value = v;
          if (currentFakeInput) currentFakeInput.value = formatForDisplay(v);
          currentDateInput && currentDateInput.dispatchEvent(new Event('change', { bubbles: true }));
          calendarEl.style.display = 'none';
          calendarEl.setAttribute('aria-hidden', 'true');
        });
      });
      var clearBtn = calendarEl.querySelector('[data-action="clear"]');
      var todayBtn = calendarEl.querySelector('[data-action="today"]');
      if (clearBtn) clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (currentDateInput) currentDateInput.value = '';
        if (currentFakeInput) currentFakeInput.value = '';
        calendarEl.style.display = 'none';
        calendarEl.setAttribute('aria-hidden', 'true');
      });
      if (todayBtn) todayBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var t = new Date();
        var v = formatForInput(t);
        if (currentDateInput) currentDateInput.value = v;
        if (currentFakeInput) currentFakeInput.value = formatForDisplay(v);
        currentDateInput && currentDateInput.dispatchEvent(new Event('change', { bubbles: true }));
        calendarEl.style.display = 'none';
        calendarEl.setAttribute('aria-hidden', 'true');
      });
    }

    form.querySelectorAll('input[type="date"]').forEach(function (input) {
      var wrap = document.createElement('div');
      wrap.className = 'date-pick-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      input.style.position = 'absolute';
      input.style.left = '0';
      input.style.top = '0';
      input.style.width = '1px';
      input.style.height = '1px';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      input.style.clip = 'rect(0,0,0,0)';
      var fake = document.createElement('input');
      fake.type = 'text';
      fake.className = 'input date-pick-fake';
      fake.placeholder = 'ДД.ММ.ГГГГ';
      fake.autocomplete = 'off';
      fake.value = formatForDisplay(input.value);
      wrap.appendChild(fake);
      function applyFakeInputValue() {
        var raw = (fake.value || '').trim();
        if (!raw) {
          input.value = '';
          return;
        }
        var m = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
        if (m) {
          var day = parseInt(m[1], 10);
          var month = parseInt(m[2], 10) - 1;
          var year = parseInt(m[3], 10);
          if (year >= 1920 && year <= 2100 && month >= 0 && month <= 11 && day >= 1 && day <= 31) {
            var testDate = new Date(year, month, day);
            if (testDate.getFullYear() === year && testDate.getMonth() === month && testDate.getDate() === day) {
              input.value = formatForInput(testDate);
              fake.value = formatForDisplay(input.value);
              input.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }
        }
        fake.value = formatForDisplay(input.value);
      }
      fake.addEventListener('blur', applyFakeInputValue);
      fake.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyFakeInputValue();
          fake.blur();
        }
      });
      fake.addEventListener('click', function (e) {
        e.preventDefault();
        currentDateInput = input;
        currentFakeInput = fake;
        pickerMode = null;
        var val = input.value ? parseInputValue(input.value) : new Date();
        viewYear = val.getFullYear();
        viewMonth = val.getMonth();
        renderCalendar();
        var rect = wrap.getBoundingClientRect();
        calendarEl.style.position = 'fixed';
        calendarEl.style.left = rect.left + 'px';
        calendarEl.style.top = (rect.bottom + 4) + 'px';
        calendarEl.style.display = 'block';
        calendarEl.setAttribute('aria-hidden', 'false');
      });
    });
    document.addEventListener('click', function (e) {
      if (calendarEl.style.display === 'block' && !calendarEl.contains(e.target) && !e.target.classList.contains('date-pick-fake')) {
        calendarEl.style.display = 'none';
        calendarEl.setAttribute('aria-hidden', 'true');
      }
    });
    var origSetProfileToForm = setProfileToForm;
    setProfileToForm = function (profile) {
      origSetProfileToForm(profile);
      syncDateDisplays();
    };
  }
