PROJECT SCOPE — MANDATORY
WORK ONLY IN: D:\PROJECTS\Dharma_Time_WEB
NEVER EDIT, CREATE, DELETE, OR FORMAT FILES IN CORE: D:\PROJECTS\Dharma_Time_v4
ALL CHANGES MUST STAY INSIDE THE WEB DIRECTORY ABOVE.

# Dharma Time WEB

> **ГРАНИЦЫ ПРОЕКТА — ОБЯЗАТЕЛЬНО**
>
> Единственная рабочая папка: **D:\PROJECTS\Dharma_Time_WEB**. Работа ведётся только в ней.
>
> Вычислительное ядро: **D:\PROJECTS\Dharma_Time_v4**. **В ядро не вносим никаких изменений** — не редактируем, не создаём, не удаляем и не форматируем файлы ядра. Все изменения выполняются только в WEB-папке. Если задача требует изменения ядра, фиксируем ограничение и ищем решение на стороне WEB либо останавливаемся.

## Документация

- План разработки: temp/docs/PLAN.md
- Контракт API: temp/docs/API_CONTRACT.md
- Подготовка Enzonic (деплой не выполнен): temp/docs/ENZONIC_DEPLOY.md
- Карта зависимости ядра: temp/docs/NUCLEUS.md
- Машинный граф (локальный): temp/docs/NUCLEUS_GRAPH.json

## Локальная разработка

- Точка входа FastAPI: main.py
- HTTP-тесты: tests/test_http_api.py
- Окружение Python 3.11: temp/venv_api

Ядро является read-only зависимостью. Не подключать Enzonic и не выполнять deployment без отдельного разрешения. Не создавать коммиты и не отправлять изменения без отдельного указания.
