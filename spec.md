# Техническая спецификация (Spec)
## Визовый помощник — приложение Т-Путешествия

**Версия:** 1.0  
**Дата:** 28 февраля 2025  
**Связанный документ:** [PRD](prd.md)

---

## 1. Область и цели документа

Спецификация описывает техническую реализацию визового помощника из PRD: контракты API, модели данных, компоненты системы, правила валидации и конфигурацию. Документ предназначен для разработки бэкенда и согласования интеграции с клиентом Т-Путешествия.

---

## 2. Архитектура системы

### 2.1 Компоненты

| Компонент | Назначение | Ответственность |
|-----------|------------|------------------|
| **Visa Assistant API** | Единая точка входа для клиента | Auth, маршрутизация, оркестрация, rate limit |
| **Profile Service** | Визовый профиль пользователя | CRUD профиля, версионирование, синхронизация |
| **Document Service** | Обработка загруженных файлов | Приём файлов, OCR/парсинг, извлечение полей, хранение |
| **Form Fill Service** | Заполнение заявок | Маппинг профиль→форма, вызов LLM, сбор результата |
| **Validation Service** | Проверка данных | Правила по странам, чек-листы, блокирующие/предупреждающие ошибки |
| **Template & Config Store** | Шаблоны форм и правил | Версионируемые шаблоны полей, промпты, правила валидации по странам |

### 2.2 Диаграмма последовательности (заполнение заявки)

```
Client          Visa API       Profile Svc    Document Svc   Form Fill Svc   LLM API    Validation
  |                 |                |               |               |            |            |
  |--POST /fill---->|                |               |               |            |            |
  |                 |--get profile-->|               |               |            |            |
  |                 |<--profile------|               |               |            |            |
  |                 |--get parsed--->|               |               |            |            |
  |                 |<--extracted----|               |               |            |            |
  |                 |--fill form------------------->|               |            |            |
  |                 |                |               |--request----->|--complete->|            |
  |                 |                |               |               |<--JSON-----|            |
  |                 |                |               |<--filled form-|            |            |
  |                 |--validate----------------------------------------------->|            |
  |                 |<--errors/warnings----------------------------------------|            |
  |<--200 + form----|                |               |               |            |            |
```

### 2.3 Диаграмма развёртывания (концепт)

- **Client:** нативное/веб-приложение Т-Путешествия; общается только с Visa Assistant API (HTTPS).
- **Visa Assistant API:** за бэкендом Т-Путешествия или как отдельный сервис; доступ к БД профилей, object storage для документов, вызов Document/LLM (внутренние сервисы или внешние API).
- **LLM / OCR:** облачный или on-prem провайдер; вызовы только с бэкенда, ключи в секретах.

---

## 3. Модели данных

### 3.1 Идентификаторы

- `user_id` — идентификатор пользователя из системы Т-Путешествия (строка, формат TBD: UUID или внутренний ID).
- `profile_id` — UUID визового профиля (один активный профиль на пользователя в MVP; в v1.1 — несколько профилей, например для членов семьи).
- `application_id` — UUID заявки (сессия заполнения формы для страны + тип визы).
- `document_id` — UUID загруженного документа.

### 3.2 Визовый профиль (VisaProfile)

Единая модель для хранения введённых и извлечённых данных. Поля приведены в обобщённом виде; фактический набор по странам задаётся шаблонами (см. п. 6).

```yaml
# Псевдо-YAML для наглядности; реализация — JSON Schema / типы в коде

VisaProfile:
  id: uuid
  user_id: string
  version: integer                    # для оптимистичной блокировки
  updated_at: datetime (ISO 8601)

  # Персональные данные
  personal:
    last_name: string                 # фамилия как в паспорте
    first_name: string
    middle_name: string | null
    birth_date: date (YYYY-MM-DD)
    birth_place: string
    citizenship: string               # код страны ISO 3166-1 alpha-2
    gender: enum(male, female, other) | null
    marital_status: enum(single, married, divorced, widowed) | null

  # Паспорт
  passport:
    number: string
    issued_by: string
    issued_at: date
    expires_at: date

  # Контакты и адрес
  contact:
    email: string
    phone: string
  address:
    country: string
    region: string | null
    city: string
    postal_code: string | null
    line: string                      # улица, дом, квартира

  # Занятость
  employment:
    status: enum(employed, self_employed, student, unemployed, retired, other)
    employer_name: string | null
    employer_address: string | null
    position: string | null
    since: date | null
    income_amount: number | null
    income_currency: string | null

  # Поездки (упрощённо для MVP)
  travel_history: array of
    country: string
    entry_date: date
    exit_date: date
    purpose: string | null

  # Источники данных (аудит)
  source:
    manual: boolean                   # true если введено пользователем
    extracted_from_documents: array of document_id
```

### 3.3 Документ (Document)

```yaml
Document:
  id: uuid
  profile_id: uuid
  user_id: string

  type: enum(passport_scan, photo, employment_letter, bank_statement, invitation, other)
  file_name: string
  mime_type: string                   # application/pdf, image/jpeg, image/png
  size_bytes: integer
  storage_key: string                 # ключ в object storage (не URL наружу)

  extracted_data: object | null       # результат парсинга/OCR (структура зависит от type)
  extraction_status: enum(pending, completed, failed)
  extraction_error: string | null

  created_at: datetime
  expires_at: datetime                # автоудаление по политике хранения
```

### 3.4 Шаблон формы (FormTemplate)

Описание полей заявки по стране и типу визы. Хранится в Template & Config Store, версионируется.

```yaml
FormTemplate:
  id: string                          # например "schengen_tourist_v1"
  country: enum(usa, schengen, uk, japan)
  visa_type: string                   # tourist, business, etc.
  version: string                     # семвер или дата

  fields: array of
    key: string                       # уникальный ключ поля в форме
    label: string                     # для UI
    type: enum(string, date, number, boolean, enum, phone, email)
    required: boolean
    max_length: integer | null
    pattern: string | null            # regex для валидации
    enum_values: array of string | null
    profile_path: string | null       # путь в VisaProfile, например "personal.last_name"
    hint: string | null
    official_source_url: string | null
```

### 3.5 Заявка (заполненная форма) (FilledApplication)

Результат работы Form Fill Service + выбора пользователя (редактирование). Не обязательно персистить в MVP; можно возвращать только в ответе API и сохранять в v1.1 для истории.

```yaml
FilledApplication:
  application_id: uuid
  profile_id: uuid
  template_id: string
  country: string
  visa_type: string

  fields: object                     # key → value по FormTemplate.fields
  validation_result: ValidationResult
  filled_at: datetime
  edited_by_user: boolean             # были ли правки после автозаполнения
```

### 3.6 Результат валидации (ValidationResult)

```yaml
ValidationResult:
  valid: boolean                      # нет блокирующих ошибок
  errors: array of
    field_key: string
    code: string                      # например "passport_expiry_too_soon"
    message: string
    severity: enum(blocking, warning)
    official_reference: string | null
  checklist: array of
    item: string
    passed: boolean
    detail: string | null
```

---

## 4. API спецификация

Базовый путь: `https://api.t-travel.example/visa-assistant/v1` (TBD под реальный домен).

Аутентификация: Bearer-токен или заголовок, выдаваемый шлюзом Т-Путешествия после аутентификации пользователя. Все запросы привязаны к `user_id`, извлечённому из токена.

### 4.1 Профиль

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/profiles/me` | Получить текущий визовый профиль пользователя. 404 если нет. |
| PUT | `/profiles/me` | Создать или обновить профиль (idempotent по user_id). Тело: VisaProfile (без id, user_id). |
| PATCH | `/profiles/me` | Частичное обновление (JSON Merge Patch). |

**Ответ GET/PUT/PATCH:** `200 OK`, тело — объект `VisaProfile`.

### 4.2 Документы

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/profiles/me/documents` | Загрузить документ. `Content-Type: multipart/form-data`; поле `file` + опционально `type` (passport_scan \| photo \| …). |
| GET | `/profiles/me/documents` | Список документов профиля. |
| GET | `/profiles/me/documents/{document_id}` | Метаданные документа (без отдачи файла по умолчанию). |
| GET | `/profiles/me/documents/{document_id}/download` | Скачать файл (временная подписанная ссылка или stream). |
| DELETE | `/profiles/me/documents/{document_id}` | Удалить документ. |

**Ответ POST:** `201 Created`, тело — объект `Document` (включая `extraction_status: pending`). После асинхронного парсинга клиент может опрашивать GET по `document_id` или получать webhook (TBD).

**Лимиты:** макс. размер файла 10 MB; допустимые MIME: `application/pdf`, `image/jpeg`, `image/png`.

### 4.3 Заполнение формы и валидация

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/applications/fill` | Заполнить форму заявки по профилю и документам. Тело: `{ "country": "schengen", "visa_type": "tourist" }`. |
| POST | `/applications/validate` | Валидировать уже заполненную форму (например после правок пользователя). Тело: `{ "application_id": "uuid", "fields": { ... } }`. |
| GET | `/applications/templates` | Список доступных шаблонов: страна + тип визы (для выпадающих списков в UI). |

**Ответ POST /applications/fill:**  
`200 OK` — тело: `{ "application_id": "uuid", "template_id": "string", "fields": { ... }, "validation_result": { ... } }`.  
При ошибке (нет профиля, шаблон не найден, ошибка LLM): `4xx/5xx` с кодом и сообщением.

**Ответ POST /applications/validate:**  
`200 OK` — тело: `{ "validation_result": { ... } }`.

### 4.4 Экспорт (v1.1 или v2.0)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/applications/{application_id}/export` | Сформировать пакет для подачи (PDF анкеты + список документов). Формат (PDF/JSON) — TBD. |

В MVP экспорт может быть реализован на клиенте: клиент получает `fields` и сам формирует PDF/заполняет внешнюю форму.

### 4.5 Обратная связь по качеству (Evaluation)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/applications/{application_id}/feedback` | Отправить оценку автозаполнения. Тело: `{ "block": "personal" \| "passport" \| "employment" \| "full", "correct": boolean }`. |

Данные используются только в агрегированном виде для метрик и улучшения промптов.

---

## 5. Сервисы (внутренняя реализация)

### 5.1 Document Service

- **Приём файла:** проверка MIME, размера → сохранение в object storage под ключом `{user_id}/{profile_id}/{document_id}.{ext}` → запись метаданных в БД со статусом `pending`.
- **Парсинг:** асинхронная очередь (или синхронно в MVP). Для `passport_scan`: вызов OCR/vision API, извлечение полей (ФИО, дата рождения, номер паспорта, срок действия) в структуру `extracted_data`; обновление статуса `completed` / `failed`.
- **Обновление профиля:** опционально — автоматически подставлять извлечённые поля в профиль с пометкой `source.extracted_from_documents` (или только отдавать в Form Fill без записи в профиль — решение продукта).

### 5.2 Form Fill Service

- **Вход:** `user_id`, `profile_id`, `country`, `visa_type`.
- **Шаги:**  
  1. Загрузить FormTemplate для (country, visa_type).  
  2. Загрузить VisaProfile и все Document с `extraction_status=completed` и их `extracted_data`.  
  3. Сформировать промпт для LLM: системная инструкция + шаблон полей + JSON профиля + извлечённые данные документов + требование вернуть только JSON с ключами полей.  
  4. Вызвать LLM (structured output / JSON mode).  
  5. Сопоставить ответ с полями шаблона, подставить недостающее из профиля по `profile_path`.  
  6. Вызвать Validation Service, вернуть заполненную форму и результат валидации.
- **Таймаут и повторы:** таймаут вызова LLM например 30 с; одна повторная попытка при 5xx; при неудаче — ответ 503 с сообщением для пользователя.

### 5.3 Validation Service

- **Вход:** заполненная форма (fields) + template_id (или country + visa_type).
- **Правила:** загружаются из Config Store по template_id: обязательность полей, regex (pattern), длина, допустимые значения enum, даты (например срок действия паспорта > N месяцев от даты поездки), ссылки на официальные требования.
- **Выход:** ValidationResult с блокирующими ошибками (valid=false) и предупреждениями; чек-лист (паспорт действителен, фото соответствует и т.д.) для отображения в UI.

### 5.4 Profile Service

- CRUD по `user_id`; при первом PUT создаётся профиль с `profile_id` (UUID).  
- Оптимистичная блокировка по `version`: при конфликте — 409, клиент повторяет с актуальными данными.  
- Синхронизация (v1.1): при наличии аккаунта Т-Путешествия — сохранение в облачную БД с привязкой к user_id; конфликты при редактировании с нескольких устройств — политика TBD (last-write-wins или merge).

---

## 6. Конфигурация и шаблоны

### 6.1 Хранение

- **FormTemplate:** JSON/YAML файлы в репозитории или в конфиг-сервисе (S3, БД), с версией. Идентификатор: `{country}_{visa_type}_v{version}`.
- **Промпты:** отдельные файлы или записи в БД с версией; в промпте — плейсхолдеры для подстановки полей шаблона и инструкций по формату вывода (JSON schema для LLM).
- **Правила валидации:** в составе FormTemplate (required, pattern, max_length) плюс отдельный набор правил по стране (срок действия паспорта, размер фото и т.д.), загружаемый по template_id.

### 6.2 Пример маппинга (профиль → форма)

Для поля формы `surname` в шаблоне Шенген:

- `profile_path: "personal.last_name"`
- При отсутствии в ответе LLM — взять значение из профиля по этому пути.
- Валидация: `required: true`, `pattern: "^[A-Za-z\\s\\-']+$"` (пример), `max_length: 50`.

### 6.3 Обновление шаблонов

- Процесс: ответственный обновляет файлы/записи шаблонов и правил по официальным источникам; деплой конфигурации без деплоя кода (релиз конфигов отдельно).
- Мониторинг: подписка на изменения на сайтах консульств/ВЦ или периодическая сверка — TBD.

---

## 7. Безопасность и соответствие

- **Транспорт:** только HTTPS (TLS 1.2+).
- **Хранение данных:** шифрование БД и object storage at rest (ключи в KMS); секреты (API keys LLM, OCR) — в секрет-менеджере, не в коде.
- **Доступ к данным:** выборки по `user_id` из токена; отсутствие кросс-доступа между пользователями. Админский доступ — только через выделенный канал с аудитом.
- **Логи:** не логировать содержимое профиля и полей заявки в открытом виде; логировать только `user_id`, `application_id`, факт вызова (например «fill requested», «fill completed»), коды ошибок.
- **Срок хранения документов:** настраиваемый TTL (например 365 дней); удаление по `expires_at` фоновой задачей; возможность удаления по запросу пользователя (DELETE документа, при удалении профиля — удалить все документы пользователя).
- **Согласие:** перед первым сохранением профиля/документов — явное согласие на обработку ПД и хранение; текст и механизм — по согласованию с юристами (152-ФЗ, GDPR).

---

## 8. Обработка ошибок и наблюдаемость

- **Коды HTTP:** 400 — невалидное тело/параметры; 401 — не авторизован; 403 — нет доступа к ресурсу; 404 — профиль/документ/шаблон не найден; 409 — конфликт версии профиля; 413 — файл слишком большой; 422 — ошибка валидации бизнес-правил; 503 — недоступен LLM/OCR или таймаут.
- **Тело ошибки:** JSON `{ "code": "string", "message": "string", "details": object | null }`.
- **Метрики:** количество запросов fill/validate по country, latency перцентили, доля ошибок LLM/OCR; количество активных профилей и загрузок документов.
- **Алерты:** падение доступности API, рост 5xx, доля таймаутов LLM выше порога.

---

## 9. Зависимости и окружение

- **Стек (рекомендация, TBD):** язык/фреймворк бэкенда — на усмотрение команды Т-Путешествия; БД — реляционная или документная для профилей и метаданных; object storage — S3-совместимый; очередь задач — для асинхронного парсинга документов (или синхронный вызов в MVP).
- **Внешние зависимости:** LLM API (OpenAI-compatible или иной с JSON mode); OCR/vision API (например для паспортов). Резерв: при недоступности OCR — только ручной ввод профиля, без автозаполнения из документов.
- **Окружения:** dev, staging, production; в production ключи LLM/OCR и БД — из защищённого хранилища; feature flags для включения стран и типов виз по этапам (MVP → v1.1).

---

## 10. Чек-лист реализации (MVP)

- [ ] Auth: извлечение `user_id` из токена Т-Путешествия.
- [ ] Profile: GET/PUT/PATCH `/profiles/me`, модель VisaProfile, хранение в БД.
- [ ] Documents: POST/GET/DELETE документов, сохранение в object storage, метаданные в БД; парсинг паспорта (OCR) с записью `extracted_data`.
- [ ] FormTemplate: минимум один шаблон (например Шенген, туристическая виза) с полями и правилами валидации.
- [ ] Form Fill: сборка контекста (профиль + документы), вызов LLM, маппинг ответа в поля формы.
- [ ] Validation: проверка по шаблону, возврат ValidationResult.
- [ ] API: POST `/applications/fill`, GET `/applications/templates`.
- [ ] Логирование и метрики без ПД в логах.
- [ ] Документация API (OpenAPI) и описание формата профиля/шаблона для фронтенда.

---

*Спецификация согласована с PRD. Изменения в полях форм и списке стран вносятся через обновление шаблонов и конфигурации; изменения контрактов API — с версионированием (v1, v2).*
