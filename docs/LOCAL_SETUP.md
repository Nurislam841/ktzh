# Local Setup Without Docker

Этот сценарий нужен, чтобы новый разработчик поднял проект локально без `docker-compose`.

## 1. Что должно быть установлено

- Node.js 20+
- npm 10+
- PostgreSQL 14+

Опционально:

- Redis, если позже будет использоваться под фоновые задачи

## 2. Клонировать репозиторий

```bash
git clone <repo-url>
cd ktz
```

## 3. Подготовить `.env`

Backend:

```bash
cp backend/.env.example backend/.env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
```

Проверь, что в `backend/.env` указан правильный локальный Postgres:

```env
DATABASE_URL=postgresql://ktz:ktz_secret@localhost:5432/ktz_db
PORT=3001
ADMIN_TOKEN=super-secret-admin-token-change-me
NODE_ENV=development
```

И что во `frontend/.env` backend смотрит на тот же порт:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 4. Поднять PostgreSQL

Создай локальную БД и пользователя, если их еще нет:

```sql
CREATE USER ktz WITH PASSWORD 'ktz_secret';
CREATE DATABASE ktz_db OWNER ktz;
```

## 5. Установить зависимости

Из корня:

```bash
make install
```

Если `make` не хочется использовать:

```bash
cd backend && npm install
cd ../frontend && npm install
```

## 6. Подготовить Prisma

```bash
make db-generate
make db-push
```

Если нужна миграционная схема вместо `db push`:

```bash
cd backend
npx prisma migrate deploy
```

## 7. Запустить backend

```bash
make backend-dev
```

Backend:

- API: `http://localhost:3001`
- Swagger: `http://localhost:3001/api/docs`

## 8. Запустить frontend

Во втором терминале:

```bash
make frontend-dev
```

Frontend:

- `http://localhost:3000`

Если `3000` занят, Next сам выберет `3001`, `3002` и т.д.

## 9. Наполнить систему данными

### Вариант A: быстрый mock seed

```bash
curl -X POST http://localhost:3001/admin/seed \
  -H "x-admin-token: super-secret-admin-token-change-me" \
  -H "Content-Type: application/json" \
  -d '{"tracks":8,"locomotives":24,"crews":36,"trainRuns":60,"windowHours":6}'
```

### Вариант B: импорт локальных файлов

```bash
curl -X POST http://localhost:3001/admin/import-bootstrap \
  -H "x-admin-token: super-secret-admin-token-change-me" \
  -H "Content-Type: application/json" \
  -d '{"dataDir":"backend/data"}'
```

## 10. Что открыть

- Dashboard: `http://localhost:3000/dashboard`
- Node: `http://localhost:3000/node`
- GIS: `http://localhost:3000/gis`
- Simulation: `http://localhost:3000/simulation`
- Versions: `http://localhost:3000/versions`

## Частые проблемы

### Frontend показывает старый dev error overlay

```bash
cd frontend
rm -rf .next
npm run dev
```

Потом жестко перезагрузи страницу.

### Пустые данные в UI

- Выполни `seed` или `import-bootstrap`
- Проверь, что backend действительно отвечает на `http://localhost:3001/node/stations`

### Backend не поднимается

Проверь:

- порт из `backend/.env`
- доступность Postgres
- что `DATABASE_URL` указывает в правильную локальную БД

## Что еще стоит добавить позже

- `scripts/check-local-env.sh` для автоматической проверки Node/Postgres/.env
- корневой `package.json` с командой запуска обоих приложений
- отдельный `seed.ts` с предсказуемым demo-сценарием для презентаций
