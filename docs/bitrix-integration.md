# Интеграция с Битрикс24

Интерфейс приема данных реализован через REST API на стороне приложения.

## Endpoint
`POST /api/bitrix/projects/import`

## Аутентификация
Используется Bearer токен. Задайте `APP_INGEST_TOKEN` в `.env`.
Заголовок: `Authorization: Bearer <YOUR_TOKEN>`

## Формат запроса (JSON)
```json
{
  "source": "bitrix24",
  "syncId": "уникальный_ид_синхронизации",
  "mode": "full",
  "projects": [
    {
      "projectId": "124554",
      "projectName": "Название проекта",
      "status": "active",
      "executor": "Имя Фамилия",
      "deadlineAt": "2026-05-29T23:30:00+03:00",
      "tasks": [
        {
          "taskId": "1",
          "title": "Задача 1",
          "status": "Завершена",
          "weight": 10,
          "progressPercent": 100
        }
      ]
    }
  ]
}
```

## Статусы проектов
Поддерживаемые значения `status`:
- `active`
- `waiting`
- `completed`
- `cancelled`
- `overdue`
- `at_risk`

## Ошибки
- `401/403`: Проблемы с токеном.
- `400`: Неверный формат данных.
- `500`: Внутренняя ошибка сервера.
