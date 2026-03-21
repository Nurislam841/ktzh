# KTZ Node Control

Система динамического перепланирования железнодорожного узла:
- события (поломка локомотива, недоступность бригады, задержка поезда и т.д.),
- проверка конфликтов,
- пересчёт графика (greedy solver),
- версии расписания и сравнение "до/после",
- UI для узла, симуляции, версий и ресурсов.

## Стек
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: Next.js 14 + Tailwind

## Требования к Node.js

Используй Node.js `20.x` или `22.x` LTS.
Node.js `24.x` для этого репозитория не подходит: frontend на Next.js 14 может падать с ошибками вида `Cannot find module '.next/server/middleware-manifest.json'` или `pages-manifest.json`.

## Запуск локально (без Docker)

Быстрый путь из корня:

```bash
make install
make db-generate
make db-push
make backend-dev
make frontend-dev
```

Подробный сценарий: `docs/LOCAL_SETUP.md`

### 1) Проверь `.env`

`backend/.env` пример:

```env
DATABASE_URL=postgresql://ktz:ktz_secret@localhost:5433/ktz_db
REDIS_URL=redis://localhost:6379
PORT=3001
ADMIN_TOKEN=super-secret-admin-token-change-me
NODE_ENV=development
```

`frontend/.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### 2) Подними backend

```bash
cd backend
npx prisma generate
npx prisma db push
npm run start:dev
```

Backend будет доступен на `http://localhost:3001`.
Swagger: `http://localhost:3001/api/docs`

### 3) Подними frontend

В новом терминале:

```bash
cd frontend
npm run dev
```

Frontend будет доступен на `http://localhost:3000`.

Если frontend уже падал на Node.js `24`, после переключения версии очисти кэш сборки и подними его заново:

```bash
cd frontend
rm -rf .next
npm run dev
```

## Загрузка данных

### Вариант A: реальные файлы из `backend/data`

Импорт + подготовка операционных данных одной командой:

```bash
curl -X POST http://localhost:3001/admin/import-bootstrap \
  -H "x-admin-token: super-secret-admin-token-change-me" \
  -H "Content-Type: application/json" \
  -d '{"dataDir":"backend/data"}'
```

Альтернатива через npm:

```bash
cd backend
npm run import:data
npm run bootstrap:ops
```

### Вариант B: mock seed

```bash
curl -X POST http://localhost:3001/admin/seed \
  -H "x-admin-token: super-secret-admin-token-change-me" \
  -H "Content-Type: application/json" \
  -d '{"tracks":8,"locomotives":24,"crews":36,"trainRuns":60,"windowHours":6}'
```

## Что открыть в UI

- Dashboard: `http://localhost:3000/dashboard`
- Узел: `http://localhost:3000/node?hours=24`
- Ресурсы: `http://localhost:3000/resources`
- Симуляция: `http://localhost:3000/simulation`
- Версии: `http://localhost:3000/versions`

## Документация

- Пилотный scope: `docs/SCOPE_PILOT.md`
- Канонический формат данных: `docs/CANONICAL_DATA_FORMAT.md`
- Сопоставление текущего кода с BPMN-процессом подвязок: `docs/BPMN_ALIGNMENT.md`

## Полезные API

### Пилот (перепланирование узла)

- `GET /node/stations`
- `GET /node/overview?stationId=...&hours=6|12|24`
- `GET /node/resources?stationId=...`
- `POST /events`
- `GET /schedule/versions?stationId=...`
- `GET /schedule/compare?fromVersionId=...&toVersionId=...`
- `GET /analytics/node-overview?stationId=...`
- `GET /analytics/assistant?stationId=...`
- `GET /analytics/notifications?stationId=...`

### Подвязки (BPMN-контур)

- `POST /api/v1/files` — загрузка XLSX (multipart/form-data)
- `GET /api/v1/batches/:fileId` — статус обработки файла
- `GET /api/v1/validation/:fileId/errors` — ошибки валидации по строкам
- `POST /api/v1/bindings` — UPSERT подвязок
- `GET /api/v1/bindings` — список подвязок (фильтры: periodId, stationId, status)
- `GET /api/v1/bindings/:id` — деталь с конфликтами/аллокациями
- `PUT /api/v1/bindings/:id/status` — перевод статуса
- `POST /api/v1/conflicts/check` — запуск проверки конфликтов
- `GET /api/v1/conflicts` — список конфликтов
- `POST /api/v1/kpi/calculate` — расчёт KPI
- `GET /api/v1/kpi?periodId=...` — KPI витрина
- `GET /api/v1/kpi/conflicts-summary?periodId=...` — сводка конфликтов
- `GET|POST /api/v1/reference/locomotive-models` — модели локомотивов
- `GET|POST /api/v1/reference/shoulders` — плечи обслуживания
- `GET|POST /api/v1/reference/maintenance-rules` — правила ТО

## Тесты

```bash
cd backend
npm test
```

## Частые проблемы

1. `ECONNREFUSED` к Postgres
- Проверь, что Postgres запущен на порту из `DATABASE_URL`.

2. Frontend не видит backend
- Проверь `NEXT_PUBLIC_API_URL` в `frontend/.env`.
- Перезапусти `npm run dev` после изменения `.env`.

3. Пустые данные в UI
- Либо выполни `import-bootstrap`, либо `seed`.
- Проверь `stationId` в URL, открой `node?hours=24`.

## Про `backend/data` и `backend/.pgdata` в git

Можно коммитить, но обычно не рекомендуется:
- `backend/.pgdata` — служебные файлы локальной БД, очень большой и шумный дифф.
- `backend/data` — большие бинарные файлы, раздувают репозиторий.

Если репозиторий приватный и тебе это ок — можно коммитить.
Для больших файлов лучше Git LFS.
