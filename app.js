(function () {
  'use strict';

  const STORAGE_PROFILE = 'visa_assistant_profile';
  const STORAGE_DOCS = 'visa_assistant_documents';

  var supabase = typeof getSupabase === 'function' ? getSupabase() : null;

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
    clearAuthForm();
    localStorage.removeItem(STORAGE_PROFILE);
    localStorage.removeItem(STORAGE_DOCS);
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
        showAuth(false);
        if (document.getElementById('btn-logout')) document.getElementById('btn-logout').style.display = 'inline-flex';
        loadProfileFromSupabase();
      } else {
        showAuth(true);
      }
    });
    supabase.auth.getSession().then(function (_ref) {
      var data = _ref.data;
      if (data.session) {
        showAuth(false);
        if (document.getElementById('btn-logout')) document.getElementById('btn-logout').style.display = 'inline-flex';
        loadProfileFromSupabase();
      } else {
        showAuth(true);
      }
    });
  } else {
    showAuth(true);
  }

  function clearProfileForm() {
    var form = document.getElementById('form-profile');
    if (!form) return;
    form.querySelectorAll('input, select').forEach(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
      else el.value = '';
    });
  }

  function loadProfileFromSupabase() {
    if (!supabase) return;
    supabase.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) return;
      supabase.from('profiles').select('data').eq('user_id', user.id).maybeSingle()
        .then(function (res) {
          if (res.data && res.data.data && Object.keys(res.data.data).length) {
            setProfileToForm(res.data.data);
          } else {
            clearProfileForm();
          }
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

  // ——— Помощник на стартовом экране: кнопка справа снизу, по клику открывается чат ———
  var chatFab = document.getElementById('chat-fab');
  var chatOverlay = document.getElementById('chat-overlay');
  var chatClose = document.getElementById('chat-close');
  var startChatForm = document.getElementById('start-chat-form');
  var startChatMessages = document.getElementById('start-chat-messages');
  var startChatInput = document.getElementById('start-chat-input');
  if (chatFab && chatOverlay) {
    chatFab.style.display = document.getElementById('screen-start') && document.getElementById('screen-start').classList.contains('active') ? 'inline-flex' : 'none';
    chatFab.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      chatOverlay.classList.add('is-open');
      if (startChatMessages && startChatMessages.children.length === 0) {
        var welcome = 'Здравствуйте! Я помощник по подаче визы. Выберите страну и тип визы выше, затем нажмите «Заполнить заявку». Команды: /help — список команд, /документы, /чеклист, /шенген, /сша, /англия, /япония.';
        var div = document.createElement('div');
        div.className = 'chat-msg chat-msg--assistant';
        div.innerHTML = '<div class="chat-msg__role">Помощник</div><div class="chat-msg__text">' + welcome.replace(/\n/g, '<br>') + '</div>';
        startChatMessages.appendChild(div);
        startChatMessages.scrollTop = startChatMessages.scrollHeight;
      }
      if (startChatInput) startChatInput.focus();
    });
    if (chatClose) chatClose.addEventListener('click', function () { chatOverlay.classList.remove('is-open'); });
    chatOverlay.addEventListener('click', function (e) { if (e.target === chatOverlay) chatOverlay.classList.remove('is-open'); });
  }
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
        typingDiv.querySelector('.chat-msg__text').innerHTML = reply.replace(/\n/g, '<br>');
        startChatMessages.scrollTop = startChatMessages.scrollHeight;
      }, 400);
    });
  }

  function applyHash() {
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (hash === 'profile' || hash === 'documents' || hash === 'start') {
      showScreen(hash);
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
    'passport.issued_by',
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
    errEl.style.display = 'none';
    saveProfile(profile);
    if (supabase) saveProfileToSupabase(profile);
    alert('Профиль сохранён. Данные привязаны к вашему аккаунту.');
  });

  // Профиль подставляется только из Supabase для текущего пользователя (в loadProfileFromSupabase)

  // ——— Документы (mock) ———
  function loadDocuments() {
    try {
      const raw = localStorage.getItem(STORAGE_DOCS);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveDocuments(docs) {
    try {
      localStorage.setItem(STORAGE_DOCS, JSON.stringify(docs));
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

  function addDocument(file) {
    if (file.size > 10 * 1024 * 1024) {
      alert('Файл больше 10 МБ.');
      return;
    }
    var docs = loadDocuments();
    var id = 'doc-' + Date.now();
    docs.push({
      id: id,
      file_name: file.name,
      type: docTypeSelect.value,
      extraction_status: 'pending',
      created_at: new Date().toISOString()
    });
    saveDocuments(docs);
    renderDocList();
    setTimeout(function () {
      docs = loadDocuments();
      var doc = docs.find(function (d) { return d.id === id; });
      if (doc) {
        doc.extraction_status = 'completed';
        saveDocuments(docs);
        renderDocList();
      }
    }, 1500);
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

  var btnFill = document.getElementById('btn-fill');
  var fillResult = document.getElementById('fill-result');
  var fillLoading = document.getElementById('fill-loading');
  var filledFormEl = document.getElementById('filled-form');
  var validationBlockEl = document.getElementById('validation-block');

  btnFill.addEventListener('click', function () {
    var profile = loadProfile();
    if (!profile || !profile.personal || !profile.personal.last_name) {
      alert('Сначала заполните и сохраните «Мой визовый профиль».');
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
      passport_issued_by: pass.issued_by || '—',
      passport_issued_at: pass.issued_at || '—',
      passport_expires_at: pass.expires_at || '—',
      email: contact.email || '—',
      phone: contact.phone || '—',
      address_line: addr.line || '—',
      city: addr.city || '—',
      postal_code: addr.postal_code || '—',
      country_residence: addr.country === 'RU' ? 'Russia' : (addr.country || '—'),
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
      { item: 'Фото соответствует требованиям (размер, фон)', passed: true, detail: null },
      { item: 'Все обязательные поля заполнены', passed: true, detail: null },
      { item: 'Даты в формате ДД.ММ.ГГГГ где требуется', passed: true, detail: null }
    ];
    var exp = pass.expires_at;
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
      passport_issued_by: 'Кем выдан',
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
    window.location.href = 'export.html?country=' + encodeURIComponent(country) + '&visa_type=' + encodeURIComponent(visaType);
  });
})();
