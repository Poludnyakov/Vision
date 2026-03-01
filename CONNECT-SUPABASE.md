# Подключение Supabase к визовому помощнику

Вход по паролю (без подтверждения по почте). На стартовом экране: **Войти в аккаунт** или **Создать аккаунт**. Все пользователи сохраняются в Supabase Auth, данные профиля и анкет синхронизируются с учётной записью.

**Обязательно для входа после регистрации:** в дашборде Supabase откройте **Authentication** → **Providers** → **Email** и **отключите** опцию **Confirm email** (или **Enable email confirmations** = OFF). Иначе пользователь после «Создать аккаунт» не сможет войти по паролю, пока не подтвердит почту. При отключённом подтверждении вход по паролю работает сразу.

---

## 1. Создать таблицы в БД

В дашборде Supabase откройте **SQL Editor** и выполните **не имя файла**, а **весь код** из файла `supabase-schema.sql`:

1. Откройте в этом проекте файл `supabase-schema.sql`.
2. Скопируйте **всё** его содержимое (от `-- Таблицы для визового помощника` до последней строки с `auth.uid()`).
3. В Supabase → SQL Editor создайте новый запрос (New query) и вставьте скопированный SQL.
4. Нажмите **Run** (или Ctrl+Enter).

Если запрос выполнится без ошибок, появятся таблицы `profiles`, `documents`, `motivation_letters`, `applications` (анкеты по странам, в т.ч. UK) и политики RLS. Если вы уже создавали таблицы раньше, выполните в SQL Editor только блок с `create table ... applications` и `alter table ... applications enable row level security` + `create policy "applications_all"` из `supabase-schema.sql`.

---

## 2. Взять URL и ключ проекта

1. В дашборде Supabase нажмите **Connect** (в шапке) или откройте **Project Settings** (иконка шестерёнки) → **API**.
2. Скопируйте:
   - **Project URL** (например `https://xxxxx.supabase.co`);
   - **anon public** key (длинная строка в блоке Project API keys).

---

## 3. Прописать данные в проект

Откройте файл **`supabase-config.js`** в папке `prototype` и замените заглушки на свои значения:

```javascript
window.SUPABASE_URL = 'https://ВАШ_PROJECT_REF.supabase.co';
window.SUPABASE_ANON_KEY = 'ваш_anon_public_ключ';
```

Сохраните файл и перезагрузите сайт (например, http://localhost:8080). После этого вход по почте и сохранение профиля/писем будут идти через Supabase.
