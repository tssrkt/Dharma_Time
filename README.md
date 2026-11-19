# Dharma Time WEB — frontend

D:\PROJECTS\Dharma_Time_WEB — только frontend. Целевой публичный репозиторий: tssrkt/Dharma_Time_WEB; публикация: GitHub Pages.

## Архитектура
- Frontend: публичный GitHub-репозиторий → GitHub Pages.
- Backend: `D:\PROJECTS\Dharma_Time_Backend` — отдельная копия ядра и HTTP API.
- После подготовки backend: новый приватный GitHub-репозиторий → Enzonic Deploy Free.
- Связь: HTTPS API и JSON.
- Оригинал D:\PROJECTS\Dharma_Time_v4 не изменять. Целевой backend не размещать в frontend-папке.

## Документы
- Главный план: temp/docs/PLAN.md
- API-контракт: temp/docs/API_CONTRACT.md
- Enzonic: temp/docs/ENZONIC_DEPLOY.md
- Аудит исходного ядра: temp/docs/NUCLEUS.md
- Локальный граф: temp/docs/NUCLEUS_GRAPH.json
- Дизайн: temp/docs/INTERFACE_DESIGN.md
- Wireframes: temp/docs/WIREFRAMES.md

HTTP API-прототип и его тесты перенесены в `D:\PROJECTS\Dharma_Time_Backend` (`api_main.py`, `tests/test_http_api.py`). В WEB-папке API-кода и Python-зависимостей оставаться не должно. Enzonic deployment ещё не выполнен.

Без БД, регистрации, платёжных аккаунтов, банковских карт, биллинга и платных оверлимитов. temp/docs — локальная документация/графы; не коммитить и не публиковать без отдельного указания.
