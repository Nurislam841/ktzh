# BPMN Alignment: текущее состояние и разрыв до целевой модели

## Назначение

Этот документ связывает целевой BPMN-процесс по подвязкам локомотивов с текущей реализацией в репозитории. Он нужен, чтобы отделить уже работающий пилот перепланирования узла от следующего этапа: промышленного контура по каноническим подвязкам, MDM и согласованию.

## Что уже есть в проекте

Текущая система покрывает пилотный сценарий оперативного перепланирования узла:

- загрузка исходных файлов и bootstrap операционных данных;
- сущности `Train`, `TrainRun`, `ScheduleVersion`, `Allocation`, `OperationalEvent`;
- пересчёт версий расписания;
- базовое согласование версий;
- детекция конфликтов по путям, локомотивам и бригадам;
- базовые KPI и уведомления.

Ключевые точки реализации:

- Prisma-схема: [backend/prisma/schema.prisma](/Users/adilzhan/Desktop/ktz/backend/prisma/schema.prisma)
- Импорт данных: [backend/src/modules/import-data/import-data.service.ts](/Users/adilzhan/Desktop/ktz/backend/src/modules/import-data/import-data.service.ts)
- Конфликты: [backend/src/modules/conflict-detection/conflict-detection.service.ts](/Users/adilzhan/Desktop/ktz/backend/src/modules/conflict-detection/conflict-detection.service.ts)
- Версии и согласование: [backend/src/modules/schedule/schedule.service.ts](/Users/adilzhan/Desktop/ktz/backend/src/modules/schedule/schedule.service.ts)
- KPI и рекомендации: [backend/src/modules/analytics/analytics.service.ts](/Users/adilzhan/Desktop/ktz/backend/src/modules/analytics/analytics.service.ts)

## Главное архитектурное наблюдение

Сейчас ядро системы построено вокруг модели:

- `TrainRun` = рейс;
- `Allocation` = назначение ресурсов на рейс в версии расписания;
- `ScheduleVersion` = версия плана по станции.

Целевая BPMN-модель из анализа требует другого ядра:

- `BindingPlan` = каноническая подвязка между прибытием и отправлением;
- `BindingAllocation` = назначение конкретного локомотива на подвязку;
- `BindingBatch`/`InputFile` = управляемая загрузка с версией и источником;
- `BindingConflict` = формализованный конфликт с кодом причины;
- MDM-слой для справочников и правил допустимости.

Иными словами: текущий пилот хорошо решает задачу "что делать с расписанием на узле после события", но не закрывает задачу "как канонически принять, нормализовать, валидировать и вести жизненный цикл подвязок локомотивов".

## Сопоставление BPMN с текущим кодом

| Шаг BPMN | Что есть сейчас | Статус | Комментарий |
|---|---|---|---|
| Импорт XLSX / ручное создание | `binding-import` модуль: загрузка XLSX с checksum, batch-статусами, построчной валидацией | **Реализовано** | Канонический шаблон `BindingPlan.xlsx`, модель `InputFile`, endpoint `POST /api/v1/files` |
| Проверка формата колонок | Schema-валидация по каноническим колонкам в `BindingImportService` | **Реализовано** | 6 обязательных колонок, автоматическая нормализация заголовков |
| Валидация входных данных | Построчная валидация дат, обязательных полей, ссылочной целостности | **Реализовано** | Коды ошибок: `FORMAT_ERROR`, `VALIDATION_ERROR`, `REF_NOT_FOUND` |
| Нормализация справочников | MDM-модуль: `MdmService` с резолюцией станций/поездов/серий/плеч | **Реализовано** | CRUD для `LocomotiveModel`, `ServiceShoulder`, `MaintenanceRule` |
| Определить плечо обслуживания | `ServiceShoulder` модель с depot ↔ stations ↔ model ↔ секционность | **Реализовано** | `MdmService.resolveShoulder()`, уникальный ключ по (depot, from, to, model, sections) |
| Проверить допустимость модели локомотива | `BindingConflictService.checkConflicts()` — проверка model vs shoulder | **Реализовано** | Код `MODEL_NOT_ALLOWED` |
| UPSERT подвязок в Binding DB | `BindingService.upsert()` с натуральным ключом | **Реализовано** | Ключ: (period, station, arrTrain, depTrain, arrivalDt), статусная модель DRAFT→APPROVED |
| Проверка пересечений по времени | `BindingConflictService` — time overlap по аллокациям + negative dwell | **Реализовано** | Коды `TIME_CONFLICT`, `VALIDATION_ERROR` |
| Статусы `PLANNED/CONFLICT` и причины | `BindingPlanStatus` enum + `conflictReasonCode/Details` на `BindingPlan` | **Реализовано** | 6 статусов: DRAFT, VALIDATED, PLANNED, CONFLICT, REJECTED, APPROVED |
| Расчёт ресурсов и KPI | `BindingAnalyticsService` — dwell, utilization, idle ratio, conflict counts | **Реализовано** | `KpiSnapshot` модель, endpoint `POST /api/v1/kpi/calculate` |
| Нужна экипировка или ТО | `MaintenanceRule` модель + MDM управление | **Частично** | Правила ТО хранятся, но автоматическая проверка по пробегам ещё не реализована |
| Отчёт / рекомендации / Гант | KPI витрина + conflict summary | **Частично** | Данные для отчётов доступны через API, UI-визуализация отложена |
| Согласование | Статусные переходы через `PUT /api/v1/bindings/:id/status` | **Частично** | Есть transition API, полный workflow согласования планируется |

## Ключевые пробелы (обновлено)

### ~~1. Нет канонической сущности подвязки~~ ✅ УСТРАНЕНО

Реализована модель `BindingPlan` с натуральным ключом `(periodId, turnaroundStationId, arrivalTrainId, departureTrainId, arrivalDt)`, UPSERT-логикой и статусной моделью (DRAFT → VALIDATED → PLANNED/CONFLICT → APPROVED/REJECTED). Аллокация конкретного локомотива выделена в отдельную модель `BindingAllocation`.

### ~~2. Нет контура MDM~~ ✅ УСТРАНЕНО

Реализован MDM-модуль с моделями `LocomotiveModel`, `ServiceShoulder`, `MaintenanceRule`, `Route`, `RouteStop`. API под `/api/v1/reference/*`.

### ~~3. Импорт остаётся эвристическим~~ ✅ УСТРАНЕНО

Реализован контрактный импорт: `BindingImportService` с каноническим шаблоном (6 обязательных колонок), SHA-256 checksum для идемпотентности, построчной валидацией и моделью `InputFile` для batch-отслеживания.

### ~~4. Не формализована допустимость локомотива~~ ✅ УСТРАНЕНО

`BindingConflictService.checkConflicts()` проверяет допустимость модели через `ServiceShoulder.modelId` и генерирует `MODEL_NOT_ALLOWED`.

### 5. Аудит документного цикла — частично

`InputFile` хранит кто загрузил и источник файла. Полный документный trail (кто изменил, кто согласовал, версия расчётов) пока не полностью реализован.

### 6. Автоматическая проверка ТО по пробегам — не реализовано

`MaintenanceRule` модель существует, но автоматическое сопоставление с данными пробега (которые ещё не поступают) не реализовано.

## Рекомендуемая целевая модель для следующего этапа

Минимальный набор новых сущностей:

- `InputBatch`
- `InputFile`
- `BindingPlan`
- `BindingAllocation`
- `BindingConflict`
- `LocomotiveModel`
- `ServiceShoulder`
- `MaintenanceRule`
- `Route`
- `RouteStop`

Минимальные статусы для `BindingPlan`:

- `DRAFT`
- `VALIDATED`
- `PLANNED`
- `CONFLICT`
- `REJECTED`
- `APPROVED`

Принципиальное правило модели:

- `BindingPlan` хранит саму бизнес-подвязку;
- `BindingAllocation` хранит назначение конкретного локомотива;
- `ScheduleVersion` остаётся контуром оперативного перепланирования, но начинает опираться на уже нормализованные `BindingPlan`.

## Практический roadmap по репозиторию

### Phase 1. Контракт на вход

Что сделать:

- утвердить канонический XLSX/CSV-шаблон подвязки;
- добавить batch-таблицы и статусы загрузки;
- ввести построчную валидацию с кодами ошибок.

Что изменится в коде:

- новый модуль импорта поверх текущего `import-data`;
- новый raw/staging-слой;
- отказ от эвристики как от главного пути импорта.

### Phase 2. Каноническая доменная модель

Что сделать:

- расширить Prisma-схему сущностями `BindingPlan`, `BindingConflict`, `LocomotiveModel`, `ServiceShoulder`, `MaintenanceRule`;
- отделить "связку поездов" от "назначения локомотива";
- зафиксировать уникальный ключ подвязки для UPSERT.

Что изменится в коде:

- часть логики из `Allocation` перейдёт в `BindingPlan`;
- `Allocation` останется как операционный слой версий.

### Phase 3. BPMN-совместимая валидация

Что сделать:

- проверка допустимости серии локомотива по плечу;
- проверка пересечений по времени;
- вычисление `conflict_reason_code`;
- протоколирование переходов статусов.

Что изменится в коде:

- появится отдельный binding-validation service;
- `conflictFlags` можно будет оставить как производное представление для UI.

### Phase 4. Аналитика по подвязкам

Что сделать:

- расчёт простоя между прибытием и отправлением;
- расчёт потребности в тяге по плечам и сериям;
- KPI по конфликтам, простоям и загрузке парка;
- отчётность по batch/периоду/депо/станции.

## Что можно считать ближайшим реалистичным MVP

Если двигаться без слома текущего пилота, ближайший безопасный MVP выглядит так:

1. Не трогать `ScheduleVersion` и UI версий как основной рабочий контур.
2. Добавить параллельно канонический контур `BindingPlan`.
3. Научить импорт загружать подвязки в staging и затем в `BindingPlan`.
4. Поверх `BindingPlan` добавить проверки допустимости модели и временных конфликтов.
5. Только после этого связывать `BindingPlan` с существующим контуром `Allocation`.

## Решение по приоритету

Если цель проекта сейчас:

- показать рабочий пилот диспетчеризации, текущая архитектура уже достаточна;
- автоматизировать реальный процесс подвязок по BPMN, следующим приоритетом должен стать именно `BindingPlan + MDM + batch validation`.

Без этого расширения проект останется хорошим демонстратором перепланирования узла, но не станет полноценной системой управления подвязками локомотивов.
