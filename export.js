(function () {
  'use strict';

  var supabase = typeof getSupabase === 'function' ? getSupabase() : null;
  var params = new URLSearchParams(window.location.search);
  var country = params.get('country') || 'schengen';
  var visaType = params.get('visa_type') || 'tourist';
  var submitted = params.get('submitted') === '1';

  var COUNTRY_NAMES = { schengen: 'Шенген', usa: 'США', uk: 'Великобритания', japan: 'Япония' };
  var VISA_NAMES = { tourist: 'Туристическая', business: 'Деловая', transit: 'Транзитная' };

  var subtitle = document.getElementById('export-subtitle');
  if (subtitle) subtitle.textContent = (COUNTRY_NAMES[country] || country) + ', ' + (VISA_NAMES[visaType] || visaType);

  document.getElementById('export-btn-logout').addEventListener('click', function () {
    if (typeof getSupabase === 'function') {
      var sb = getSupabase();
      if (sb) sb.auth.signOut();
    }
    window.location.href = 'index.html';
  });

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
    document.addEventListener('click', function () {
      navProfileDropdown.setAttribute('hidden', '');
      navProfileTrigger.setAttribute('aria-expanded', 'false');
    });
  }

  // Показываем только блок для выбранной страны (данные привязаны к пользователю)
  document.querySelectorAll('.export-section[data-country]').forEach(function (el) {
    var sectionCountry = el.getAttribute('data-country');
    var show = (sectionCountry === 'usa' && country === 'usa') ||
      (sectionCountry === 'uk' && country === 'uk') ||
      (sectionCountry === 'other' && country !== 'usa' && country !== 'uk');
    el.style.display = show ? 'block' : 'none';
  });
  if (country === 'uk') {
    var ukBlankLink = document.getElementById('export-uk-blank');
    if (ukBlankLink) ukBlankLink.style.display = 'inline-flex';
  }

  if (country === 'usa') {
    function setUsaAppliedForUser() {
      var key = 'visa_assistant_usa_applied_anon';
      if (supabase) {
        supabase.auth.getUser().then(function (r) {
          var user = r.data && r.data.user;
          if (user && user.id) key = 'visa_assistant_usa_applied_' + user.id;
          try { localStorage.setItem(key, '1'); } catch (_) {}
        });
      } else {
        try { localStorage.setItem(key, '1'); } catch (_) {}
      }
    }
    setUsaAppliedForUser();
    var interviewBanner = document.getElementById('export-interview-banner');
    if (interviewBanner) interviewBanner.style.display = 'block';
  }
  if (submitted) {
    var statusBanner = document.getElementById('export-status-banner');
    if (statusBanner) statusBanner.style.display = 'block';
  }

  function getProfileFromSessionStorage() {
    try {
      var raw = sessionStorage.getItem('visa_export_profile');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function fillFormsFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return;
    var p = profile.personal || {};
    var pass = profile.passport || {};
    var contact = profile.contact || {};
    var emp = profile.employment || {};
    var ukForm = document.getElementById('uk-form');
    if (ukForm) {
      if (pass.number) { var el = ukForm.elements['passport_number']; if (el) el.value = pass.number; }
      if (pass.issued_at) { var el = ukForm.elements['passport_issued_at']; if (el) el.value = pass.issued_at; }
      if (pass.expires_at) { var el = ukForm.elements['passport_expires_at']; if (el) el.value = pass.expires_at; }
      if (contact.email) { var el = ukForm.elements['contact_email']; if (el) el.value = contact.email; }
      if (contact.phone) { var el = ukForm.elements['contact_phone']; if (el) el.value = contact.phone; }
      if (p.marital_status) { var el = ukForm.elements['marital_status']; if (el) el.value = p.marital_status; }
      if (emp.income_amount) { var el = ukForm.elements['income_monthly']; if (el) el.value = String(emp.income_amount); }
    }
  }

  function loadProfileAndFillForms() {
    var profile = getProfileFromSessionStorage();
    if (profile) fillFormsFromProfile(profile);
    if (supabase) {
      supabase.auth.getUser().then(function (r) {
        var user = r.data && r.data.user;
        if (!user) return;
        supabase.from('profiles').select('data').eq('user_id', user.id).maybeSingle()
          .then(function (res) {
            if (res.data && res.data.data) fillFormsFromProfile(res.data.data);
          });
      });
    }
  }

  loadProfileAndFillForms();

  function getExportDataForPdf() {
    var profile = getProfileFromSessionStorage();
    var ukForm = null;
    if (country === 'uk') {
      var f = document.getElementById('uk-form');
      if (f) {
        ukForm = {};
        f.querySelectorAll('input, select, textarea').forEach(function (el) {
          if (el.name) ukForm[el.name] = el.type === 'number' ? el.value : (el.value || '').trim();
        });
      }
    }
    return { profile: profile || {}, ukForm: ukForm };
  }

  var downloadBtn = document.getElementById('export-download-filled');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (typeof window.jspdf === 'undefined') {
      alert('Загрузка библиотеки PDF не завершена. Обновите страницу и попробуйте снова.');
      return;
    }
    var data = getExportDataForPdf();
    var profile = data.profile;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Visa Application', 14, 20);
    doc.setFontSize(11);
    doc.text((COUNTRY_NAMES[country] || country) + ', ' + (VISA_NAMES[visaType] || visaType), 14, 28);
    doc.setFontSize(10);
    var y = 36;
    var line = function (label, value) {
      if (value == null || String(value).trim() === '') return;
      var s = label + ': ' + String(value).trim().substring(0, 88);
      if (s.length > 88) s = s.substring(0, 85) + '...';
      doc.text(s, 14, y);
      y += 6;
    };
    if (country === 'uk' && data.ukForm) {
      var ukLabels = { passport_number: 'Passport number', passport_issued_at: 'Date of issue', passport_expires_at: 'Expiry date', contact_email: 'Email', contact_phone: 'Phone', marital_status: 'Marital status', spouse_name: 'Spouse/partner name', income_monthly: 'Monthly income (RUB)', expenses_monthly: 'Monthly expenses', sources_of_funds: 'Sources of funds', had_visas: 'Visas to UK/other countries', had_refusals: 'Visa refusals', visas_refusals_detail: 'Visa/refusal details', criminal_record: 'Criminal record', criminal_record_detail: 'Criminal record details', additional_info: 'Additional information', work_employer_1: 'Employer (1)', work_position_1: 'Position (1)', work_from_1: 'Start date (1)', work_to_1: 'End date (1)', travel_country_1: 'Travel country (1)', travel_purpose_1: 'Travel purpose (1)', travel_from_1: 'Entry date (1)', travel_to_1: 'Exit date (1)' };
      var p = profile.personal || {};
      line('Surname', p.last_name);
      line('First name', p.first_name);
      line('Date of birth', p.birth_date);
      line('Place of birth', p.birth_place);
      Object.keys(data.ukForm).forEach(function (k) {
        var v = data.ukForm[k];
        if (v == null || String(v).trim() === '') return;
        line(ukLabels[k] || k, v);
      });
    } else {
      var p = profile.personal || {}, pass = profile.passport || {}, contact = profile.contact || {}, addr = profile.address || {}, emp = profile.employment || {};
      var labels = { surname: 'Surname', first_name: 'First name', birth_date: 'Date of birth', birth_place: 'Place of birth', passport_number: 'Passport number', passport_issued_at: 'Date of issue', passport_expires_at: 'Expiry date', email: 'Email', phone: 'Phone', address_line: 'Address', income: 'Income' };
      line(labels.surname, p.last_name);
      line(labels.first_name, p.first_name);
      line(labels.birth_date, p.birth_date);
      line(labels.birth_place, p.birth_place);
      line(labels.passport_number, pass.number);
      line(labels.passport_issued_at, pass.issued_at);
      line(labels.passport_expires_at, pass.expires_at);
      line(labels.email, contact.email);
      line(labels.phone, contact.phone);
      line(labels.address_line, addr.line);
      line(labels.income, emp.income_amount ? emp.income_amount + ' ' + (emp.income_currency || 'RUB') : '');
    }
    var filename = 'visa-' + country + '-' + (profile.personal && profile.personal.last_name ? String(profile.personal.last_name).replace(/\s+/g, '-') : 'application') + '.pdf';
    try {
      doc.save(filename);
    } catch (err) {
      console.warn('PDF save failed', err);
      alert('Не удалось сохранить PDF. Проверьте консоль браузера (F12).');
    }
  });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ——— Мотивационное письмо (USA): только для country=usa, привязка к user_id ———
  function loadMotivationLetter() {
    if (!supabase) return;
    supabase.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) return;
      supabase.from('motivation_letters').select('*').eq('user_id', user.id).eq('country', 'usa').order('updated_at', { ascending: false }).limit(1).maybeSingle()
        .then(function (res) {
          if (res.data) {
            var f = document.getElementById('motivation-form');
            if (f) {
              ['purpose', 'ties_to_home', 'trip_plan', 'letter_text'].forEach(function (name) {
                var el = f.elements[name];
                if (el && res.data[name]) el.value = res.data[name];
              });
            }
          }
        });
    });
  }

  document.getElementById('motivation-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var data = {
      country: 'usa',
      purpose: (f.elements.purpose && f.elements.purpose.value) || '',
      ties_to_home: (f.elements.ties_to_home && f.elements.ties_to_home.value) || '',
      trip_plan: (f.elements.trip_plan && f.elements.trip_plan.value) || '',
      letter_text: (f.elements.letter_text && f.elements.letter_text.value) || '',
      updated_at: new Date().toISOString()
    };
    var statusEl = document.getElementById('motivation-status');
    if (supabase) {
      supabase.auth.getUser().then(function (r) {
        var user = r.data && r.data.user;
        if (!user) {
          statusEl.textContent = 'Войдите в аккаунт на главной странице, чтобы сохранять письмо.';
          statusEl.style.display = 'block';
          statusEl.style.color = 'var(--tb-warning)';
          return;
        }
        supabase.from('motivation_letters').upsert({ user_id: user.id, ...data }, { onConflict: 'user_id,country' }).then(function (res) {
          if (res.error) {
            statusEl.textContent = 'Ошибка: ' + (res.error.message || 'не удалось сохранить');
            statusEl.style.color = 'var(--tb-error)';
          } else {
            statusEl.textContent = 'Письмо сохранено.';
            statusEl.style.color = 'var(--tb-success)';
          }
          statusEl.style.display = 'block';
        });
      });
    } else {
      statusEl.textContent = 'Supabase не настроен. Данные не сохранены.';
      statusEl.style.color = 'var(--tb-gray-text)';
      statusEl.style.display = 'block';
    }
  });

  loadMotivationLetter();

  // ——— Анкета UK: только для country=uk, привязка к user_id ———
  var ukWorkCount = 0;
  var ukTravelCount = 0;

  function addUkWorkRow() {
    var id = ++ukWorkCount;
    var div = document.createElement('div');
    div.className = 'uk-repeat-block';
    div.innerHTML = '<div class="form-row"><div class="form-group"><label class="label">Работодатель</label><input type="text" class="input" name="work_employer_' + id + '"></div><div class="form-group"><label class="label">Должность</label><input type="text" class="input" name="work_position_' + id + '"></div></div><div class="form-row"><div class="form-group"><label class="label">Дата начала</label><input type="date" class="input" name="work_from_' + id + '"></div><div class="form-group"><label class="label">Дата окончания</label><input type="date" class="input" name="work_to_' + id + '"></div></div>';
    document.getElementById('uk-work-list').appendChild(div);
  }

  function addUkTravelRow() {
    var id = ++ukTravelCount;
    var div = document.createElement('div');
    div.className = 'uk-repeat-block';
    div.innerHTML = '<div class="form-row"><div class="form-group"><label class="label">Страна</label><input type="text" class="input" name="travel_country_' + id + '"></div><div class="form-group"><label class="label">Цель</label><input type="text" class="input" name="travel_purpose_' + id + '"></div></div><div class="form-row"><div class="form-group"><label class="label">Дата въезда</label><input type="date" class="input" name="travel_from_' + id + '"></div><div class="form-group"><label class="label">Дата выезда</label><input type="date" class="input" name="travel_to_' + id + '"></div></div>';
    document.getElementById('uk-travel-list').appendChild(div);
  }

  if (country === 'uk') {
    document.getElementById('uk-add-work').addEventListener('click', addUkWorkRow);
    document.getElementById('uk-add-travel').addEventListener('click', addUkTravelRow);
    addUkWorkRow();
    addUkTravelRow();

    document.querySelector('select[name="criminal_record"]').addEventListener('change', function () {
      document.getElementById('uk-criminal-detail-wrap').style.display = this.value === 'yes' ? 'block' : 'none';
    });

    function getUkFormData() {
      var f = document.getElementById('uk-form');
      if (!f) return {};
      var data = {};
      f.querySelectorAll('input, select, textarea').forEach(function (el) {
        var name = el.name;
        if (!name) return;
        var v = el.type === 'number' ? el.value : (el.value || '').trim();
        data[name] = v;
      });
      return data;
    }

    function setUkFormData(data) {
      var f = document.getElementById('uk-form');
      if (!f || !data) return;
      Object.keys(data).forEach(function (name) {
        var el = f.elements[name];
        if (el && data[name] != null) el.value = data[name];
      });
    }

    function loadUkApplication() {
      if (!supabase) return;
      supabase.auth.getUser().then(function (r) {
        var user = r.data && r.data.user;
        if (!user) return;
        supabase.from('applications').select('data').eq('user_id', user.id).eq('country', 'uk').maybeSingle()
          .then(function (res) {
            if (res.data && res.data.data) setUkFormData(res.data.data);
          });
      });
    }

    loadUkApplication();

    document.getElementById('uk-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = getUkFormData();
      var statusEl = document.getElementById('uk-form-status');
      if (!supabase) {
        statusEl.textContent = 'Supabase не настроен.';
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--tb-gray-text)';
        return;
      }
      supabase.auth.getUser().then(function (r) {
        var user = r.data && r.data.user;
        if (!user) {
          statusEl.textContent = 'Войдите в аккаунт на главной странице, чтобы сохранять анкету.';
          statusEl.style.color = 'var(--tb-warning)';
          statusEl.style.display = 'block';
          return;
        }
        supabase.from('applications').upsert({
          user_id: user.id,
          country: 'uk',
          visa_type: visaType,
          data: data,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,country' }).then(function (res) {
          if (res.error) {
            statusEl.textContent = 'Ошибка: ' + (res.error.message || 'не удалось сохранить');
            statusEl.style.color = 'var(--tb-error)';
          } else {
            statusEl.textContent = 'Анкета сохранена. Данные привязаны к вашему аккаунту.';
            statusEl.style.color = 'var(--tb-success)';
          }
          statusEl.style.display = 'block';
        });
      });
    });
  }

  // ——— Чат ———
  var chatMessages = document.getElementById('chat-messages');
  var chatForm = document.getElementById('chat-form');
  var chatInput = document.getElementById('chat-input');

  var CHAT_WELCOME = 'Здравствуйте! Я помощник по подаче визы. Можете спросить что угодно или ввести команду:\n\n' +
    '• /help или /команды — список команд\n' +
    '• /чеклист — что проверить перед подачей\n' +
    '• /экспорт — как экспортировать заявку\n' +
    '• /документы — какие документы нужны\n' +
    '• /шенген, /сша, /англия, /япония — требования по стране\n' +
    '• /фото — требования к фото\n' +
    '• /сроки — сроки рассмотрения\n' +
    '• /отказ — что делать при отказе\n' +
    '• /мотивационное — подсказки по мотивационному письму для США';

  function appendMessage(role, text, isTyping) {
    var div = document.createElement('div');
    div.className = 'chat-msg chat-msg--' + role + (isTyping ? ' chat-msg--typing' : '');
    div.innerHTML = (role === 'assistant' ? '<div class="chat-msg__role">Помощник</div>' : '') +
      '<div class="chat-msg__text">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function setMessageText(el, text) {
    var textEl = el && el.querySelector('.chat-msg__text');
    if (textEl) textEl.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  }

  if (chatMessages.children.length === 0) appendMessage('assistant', CHAT_WELCOME);

  function matchAny(text, list) {
    for (var i = 0; i < list.length; i++) {
      if (text.indexOf(list[i]) !== -1) return true;
    }
    return false;
  }

  function getAssistantReply(lower) {
    var cmd = lower.split(/\s/)[0];
    if (cmd === '/help' || cmd === '/команды' || cmd === '/commands' || lower === 'help' || lower === 'хелп' || lower === 'команды' || matchAny(lower, ['какие команды', 'что умеешь', 'справка'])) return CHAT_WELCOME;
    if (cmd === '/чеклист' || cmd === '/checklist' || matchAny(lower, ['чеклист', 'чек-лист', 'что проверить', 'проверь заявку', 'перед подачей'])) {
      return 'Чек-лист перед подачей:\n\n✓ Паспорт действителен не менее 3 месяцев после поездки\n✓ Фото по требованиям страны\n✓ Все поля заявки заполнены\n✓ Справка/выписка актуальны\n✓ Бронь и страховка при необходимости.';
    }
    if (cmd === '/экспорт' || cmd === '/export' || matchAny(lower, ['экспорт', 'экспортировать', 'выгрузить'])) {
      return 'На этой странице вы можете сохранить мотивационное письмо для США и задать вопросы в чате. Данные заявки подготовлены на предыдущем шаге.';
    }
    if (cmd === '/документы' || cmd === '/documents' || matchAny(lower, ['документы', 'какие документы'])) {
      return 'Основные документы: загранпаспорт, фото по формату страны, справка с работы или выписка, бронь, страховка (Шенген). Для США — анкета DS-160 и документы на собеседование.';
    }
    if (cmd === '/шенген' || matchAny(lower, ['шенген', 'европа'])) return 'Шенген: паспорт, фото 3,5×4,5 см, справка, выписка, бронь, страховка от 30 000 €. Сроки 5–15 раб. дней.';
    if (cmd === '/сша' || matchAny(lower, ['сша', 'америка', 'usa'])) {
      return 'США: анкета DS-160, фото 5×5 см, загранпаспорт. На собеседовании — подтверждение связей с родиной, финансы, маршрут. Мотивационное письмо можно подготовить в форме выше на этой странице.';
    }
    if (cmd === '/англия' || cmd === '/uk' || matchAny(lower, ['англия', 'uk'])) return 'UK: паспорт, фото по формату gov.uk, справка, выписка за 6 мес., бронь. Сроки — несколько недель.';
    if (cmd === '/япония' || matchAny(lower, ['япония', 'japan'])) return 'Япония: приглашение или путёвка, паспорт, фото 4,5×4,5 см, справка, выписка.';
    if (cmd === '/фото' || matchAny(lower, ['фото', 'требования к фото'])) return 'Шенген: 3,5×4,5 см. США: 5×5 см. UK: по gov.uk. Япония: 4,5×4,5 см. Светлый фон, без очков/головного убора.';
    if (cmd === '/сроки' || matchAny(lower, ['сроки', 'сколько ждать'])) return 'Шенген: 5–15 дней. США: от нескольких дней после собеседования. UK: несколько недель. Япония: от нескольких дней до 2 недель.';
    if (cmd === '/отказ' || matchAny(lower, ['отказ', 'отказали'])) return 'Устраните причину из решения, соберите доп. документы и подайте снова. В Шенгене возможна апелляция.';
    if (cmd === '/мотивационное' || matchAny(lower, ['мотивационное письмо', 'письмо сша', 'cover letter'])) {
      return 'Мотивационное письмо для США: укажите цель поездки, связи с родиной (работа, семья), план поездки. Текст лучше на английском. Форму выше на этой странице можно сохранить в аккаунт.';
    }
    if (matchAny(lower, ['привет', 'здравствуй'])) return 'Здравствуйте! Чем помочь по визе? Введите /help для списка команд.';
    if (matchAny(lower, ['спасибо'])) return 'Пожалуйста! Удачи с подачей.';
    if (matchAny(lower, ['виза', 'подача', 'документы'])) return 'Могу подсказать по документам (/документы), чек-листу (/чеклист), стране: /шенген, /сша, /англия, /япония. Или /мотивационное — для письма в США.';
    return 'Задайте вопрос про документы, сроки или страну. Команды: /help, /документы, /сша, /мотивационное.';
  }

  function callLLM(messages, onReply) {
    var apiUrl = typeof window.VISA_CHAT_API_URL !== 'undefined' ? window.VISA_CHAT_API_URL : '';
    if (apiUrl) {
      var body = { messages: messages };
      var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
      if (typeof window.VISA_CHAT_API_KEY !== 'undefined' && window.VISA_CHAT_API_KEY) opts.headers['Authorization'] = 'Bearer ' + window.VISA_CHAT_API_KEY;
      fetch(apiUrl, opts).then(function (r) { return r.json(); })
        .then(function (data) { onReply((data.reply || data.text || data.message || '').trim() || 'Нет ответа.'); })
        .catch(function () { onReply('Сервис недоступен.'); });
      return;
    }
    var userLast = (messages.filter(function (m) { return m.role === 'user'; }).pop() || {}).content || '';
    var lower = userLast.toLowerCase().replace(/\s+/g, ' ');
    var reply = getAssistantReply(lower);
    setTimeout(function () { onReply(reply); }, 400 + Math.random() * 200);
  }

  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = (chatInput.value || '').trim();
    if (!text) return;
    chatInput.value = '';
    appendMessage('user', text);
    var typingEl = appendMessage('assistant', '…', true);
    var history = [];
    chatMessages.querySelectorAll('.chat-msg__text').forEach(function (el) {
      var msg = el.closest('.chat-msg');
      if (!msg || msg.classList.contains('chat-msg--typing')) return;
      var role = msg.classList.contains('chat-msg--user') ? 'user' : 'assistant';
      history.push({ role: role, content: el.textContent });
    });
    callLLM(history, function (reply) {
      typingEl.classList.remove('chat-msg--typing');
      setMessageText(typingEl, reply);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  });
})();
