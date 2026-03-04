# Канонический формат данных

## 1) TrainPlanRecord

```json
{
  "train_no": "701",
  "station_from": "АЛМАТЫ-1",
  "station_to": "АСТАНА",
  "planned_departure": "2026-03-04T15:00:00+05:00",
  "planned_arrival": "2026-03-04T20:30:00+05:00",
  "priority": 2,
  "required_loco_type": "VL80",
  "node": "ALMATY_NODE"
}
```

Поля:
- `priority`: 1 = высокий (пассажир), 2 = средний (грузовой), 3 = низкий.
- `required_loco_type`: опционально.

## 2) ResourceSnapshot

```json
{
  "locomotives": [
    {
      "id": "loco-001",
      "location": "АЛМАТЫ-1",
      "status": "AVAILABLE",
      "available_from": "2026-03-04T13:00:00+05:00"
    }
  ],
  "crews": [
    {
      "id": "crew-101",
      "depot": "АЛМАТИНСКОЕ ДЕПО",
      "status": "AVAILABLE",
      "available_from": "2026-03-04T12:00:00+05:00"
    }
  ],
  "tracks": [
    {
      "id": "track-1",
      "status": "FREE",
      "available_from": "2026-03-04T00:00:00+05:00"
    }
  ]
}
```

## 3) Рекомендуемая загрузка в систему
- Источник: папка `backend/data`.
- Импорт: `POST /admin/import-data`.
- Подготовка операций (train_runs, tracks, crews, версии): `POST /admin/bootstrap-ops`.
- Быстрый конвейер: `POST /admin/import-bootstrap`.
