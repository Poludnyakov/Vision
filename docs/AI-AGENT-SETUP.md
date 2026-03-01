# Подключение ИИ-агента за ~15 минут

ИИ заполняет мотивационное письмо (США) и отвечает в чате. Нужен один backend-эндпоинт.

---

## Шаг 1. Куда прописать URL (1 мин)

Откройте **`supabase-config.js`** и добавьте **перед** последней строкой с `SUPABASE_ANON_KEY`:

```js
// ИИ: чат и генерация мотивационного письма
window.VISA_CHAT_API_URL = 'https://ВАШ-СЕРВЕР/chat';   // замените на ваш URL
window.VISA_CHAT_API_KEY = '';   // опционально: ключ для Authorization: Bearer
```

Либо задайте эти переменные в **`export.html`** до подключения `export.js`:

```html
<script>
  window.VISA_CHAT_API_URL = 'https://ВАШ-СЕРВЕР/chat';
  window.VISA_CHAT_API_KEY = 'ваш-ключ';  // если backend требует
</script>
<script src="supabase-config.js"></script>
<script src="export.js"></script>
```

После этого кнопка «Сгенерировать черновик с ИИ» и чат будут ходить на ваш backend.

---

## Шаг 2. Что должен уметь backend (контракт)

Один URL, метод **POST**, тело **JSON**. Два варианта тела — обрабатывайте оба.

### Вариант A: Чат (диалог)

**Тело запроса:**
```json
{
  "messages": [
    { "role": "user", "content": "Что взять на собеседование?" },
    { "role": "assistant", "content": "..." },
    { "role": "user", "content": "Сгенерируй мотивационное письмо" }
  ]
}
```

**Ответ (JSON):**
```json
{
  "reply": "Текст ответа ассистента"
}
```

Если ИИ сгенерировал письмо по просьбе в чате, можно вернуть и его:
```json
{
  "reply": "Черновик письма подставлен в форму.",
  "letter_text": "Dear Consulate,\n\nI am writing to..."
}
```

### Вариант B: Генерация письма по кнопке

**Тело запроса:**
```json
{
  "action": "generate_motivation_letter",
  "purpose": "туризм, Нью-Йорк",
  "ties_to_home": "работа, семья",
  "trip_plan": "5 дней, отель X"
}
```

**Ответ (JSON):**
```json
{
  "letter_text": "Dear Consulate,\n\nI am writing to apply for a B1/B2 visa..."
}
```

**Заголовки:** приложение шлёт `Content-Type: application/json` и, если задан `VISA_CHAT_API_KEY`, заголовок `Authorization: Bearer <VISA_CHAT_API_KEY>`.

---

## Шаг 3. Быстрый backend (выберите один способ)

### Вариант 1: Vercel Serverless (≈5 мин, без своего сервера)

1. Установите Vercel CLI: `npm i -g vercel`.
2. В папке проекта создайте папку `api` и файл `api/chat.js`:

```js
// api/chat.js
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

  try {
    // Генерация письма по кнопке
    if (body.action === 'generate_motivation_letter') {
      const prompt = `Write a short US visa motivation letter (B1/B2) in English. Purpose: ${body.purpose || 'tourism'}. Ties to home: ${body.ties_to_home || 'work, family'}. Trip plan: ${body.trip_plan || 'brief visit'}. No personal data. Formal tone.`;
      const letter = await callOpenAI(prompt);
      return res.status(200).json({ letter_text: letter });
    }

    // Чат
    const messages = body.messages || [];
    if (messages.length === 0) return res.status(200).json({ reply: 'Напишите сообщение.' });
    const lastUser = messages.filter(m => m.role === 'user').pop();
    const reply = await callOpenAI(messages, true);
    const out = { reply };
    if (lastUser && /письмо|letter|мотивационн|generate/i.test(lastUser.content)) {
      const letter = await callOpenAI(`Write a short US visa motivation letter in English. User context: ${lastUser.content}. No personal data.`);
      out.letter_text = letter;
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ reply: 'Ошибка сервера.' });
  }
}

async function callOpenAI(promptOrMessages, isChat = false) {
  const reqBody = isChat
    ? { model: 'gpt-4o-mini', messages: promptOrMessages.map(m => ({ role: m.role, content: m.content })) }
    : { model: 'gpt-4o-mini', messages: [{ role: 'user', content: promptOrMessages }] };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify(reqBody)
  });
  const data = await r.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}
```

3. В корне проекта: `vercel` (логин по запросу), затем в настройках проекта Vercel → Settings → Environment Variables добавьте **OPENAI_API_KEY** (ключ с platform.openai.com).
4. Деплой: `vercel --prod`. В консоли будет URL вида `https://ваш-проект.vercel.app`. Эндпоинт чата: **`https://ваш-проект.vercel.app/api/chat`** — его и подставьте в `VISA_CHAT_API_URL`.

---

### Вариант 2: Локальный Node + ngrok (≈7 мин)

1. Создайте файл `server-ai.js` в корне `prototype`:

```js
const http = require('http');
const OPENAI_KEY = process.env.OPENAI_API_KEY || 'sk-...'; // или через .env

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
    return res.end();
  }
  if (req.method !== 'POST' || req.url !== '/chat') {
    res.writeHead(405); return res.end();
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    const data = JSON.parse(body);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      if (data.action === 'generate_motivation_letter') {
        const prompt = `US visa motivation letter in English. Purpose: ${data.purpose}. Ties: ${data.ties_to_home}. Plan: ${data.trip_plan}.`;
        const letter = await callOpenAI(prompt);
        res.end(JSON.stringify({ letter_text: letter }));
      } else {
        const last = (data.messages || []).filter(m => m.role === 'user').pop();
        const reply = last ? await callOpenAI(last.content) : 'Напишите сообщение.';
        res.end(JSON.stringify({ reply }));
      }
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ reply: 'Ошибка сервера.' }));
    }
  });
});

async function callOpenAI(text) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: text }] })
  });
  const d = await r.json();
  return d.choices?.[0]?.message?.content?.trim() || '';
}

server.listen(3999, () => console.log('AI backend: http://localhost:3999/chat'));
```

2. Запуск: `OPENAI_API_KEY=sk-ваш-ключ node server-ai.js` (Node 18+, чтобы был глобальный `fetch`).
3. В другом терминале: `npx ngrok http 3999`. Скопируйте HTTPS-URL (например `https://abc123.ngrok.io`).
4. В `supabase-config.js`: `window.VISA_CHAT_API_URL = 'https://abc123.ngrok.io/chat';`
5. Откройте страницу экспорта и нажмите «Сгенерировать черновик с ИИ».

---

## Проверка

- Выбрать страну **США**, перейти на страницу экспорта.
- Заполнить «Цель поездки», «Связи с родиной», «План поездки».
- Нажать **«Сгенерировать черновик с ИИ»** — в поле «Текст мотивационного письма» должен появиться английский черновик.
- Открыть чат внизу страницы, написать «Сгенерируй мотивационное письмо» или любой вопрос — должен прийти ответ от ИИ.

Если видите сообщение «Задайте VISA_CHAT_API_URL» — переменная не задана или задана после загрузки `export.js`. Проверьте, что `VISA_CHAT_API_URL` задаётся **до** подключения `export.js`.
