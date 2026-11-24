# TheEnd Coin

Отдельная Telegram Mini App для игрового счёта TheEnd Coin.

## Возможности

- Авторизация через Telegram Web App initData с серверной HMAC-проверкой.
- Баланс игрока в PostgreSQL.
- Начисление одной игровой монеты по нажатию.
- Серверный cooldown и журнал операций.
- Готовый Render blueprint (`render.yaml`).

## Локальный запуск

Требуется Node.js 20+ и PostgreSQL.

1. Скопируйте `.env.example` в `.env` и укажите `DATABASE_URL` и `TELEGRAM_BOT_TOKEN`.
2. Установите зависимости: `npm install`.
3. Запустите: `npm start`.
4. Проверьте `/health`.

## Деплой

Создайте отдельный Web Service на Render из этого репозитория. Используйте Build Command `npm install`, Start Command `npm start`. Добавьте переменные `DATABASE_URL` и `TELEGRAM_BOT_TOKEN`. База должна быть доступна сервису по SSL.

После деплоя задайте HTTPS URL Mini App в настройках Telegram-бота через BotFather (Main App или Menu Button).

## Важно

Монеты на этом этапе являются только игровыми очками. Денежный вывод, обмен или фиксированная стоимость не реализованы. Никогда не публикуйте токен бота или строку подключения к базе в GitHub.