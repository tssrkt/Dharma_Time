from __future__ import annotations

# PROJECT SCOPE: Work only in D:\PROJECTS\Dharma_Time_WEB.
# The external core at D:\PROJECTS\Dharma_Time_v4 is READ-ONLY and must never be modified.

import asyncio
import json
import os
import re
import sys
import threading
import time
from collections import OrderedDict
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

# Local development uses the sibling private core checkout. Deployment must
# provide the private core in the runtime and set DHARMA_CORE_PATH if needed.
_DEFAULT_CORE_PATH = Path(__file__).resolve().parent.parent / "Dharma_Time_v4"
_CORE_PATH = Path(os.environ.get("DHARMA_CORE_PATH", str(_DEFAULT_CORE_PATH))).resolve()
if _CORE_PATH.is_dir() and str(_CORE_PATH) not in sys.path:
    sys.path.insert(0, str(_CORE_PATH))

try:
    from app.calendar_core.api import CalendarApiError, calendar_events_response
    from app.calendar_core.metadata import MODULES
except ImportError as exc:
    raise RuntimeError(
        "Calendar core is unavailable. Configure the server runtime with the private core."
    ) from exc

class QueryParameterError(ValueError):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code


app = FastAPI(title="Dharma Time API", docs_url=None, redoc_url=None, openapi_url=None)

_allowed_origins = [
    item.strip()
    for item in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "https://tssrkt.github.io,http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if item.strip()
]
# The outer CORS wrapper is applied after route registration at the end of
# this module so even early 400/429/503 responses from middleware carry CORS headers.
_CACHE_TTL_SECONDS = 60
_CACHE_MAX_ENTRIES = 128
_cache: OrderedDict[tuple[Any, ...], tuple[float, dict[str, Any]]] = OrderedDict()
_cache_lock = threading.Lock()
_inflight_tasks: dict[tuple[Any, ...], asyncio.Task] = {}
_inflight_lock = threading.Lock()
_compute_slots = asyncio.Semaphore(2)
_RATE_WINDOW_SECONDS = 60
_RATE_MAX_REQUESTS = 60
_MAX_QUERY_LENGTH = 4096
_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
_COMPUTE_TIMEOUT_SECONDS = 30
_SLOT_WAIT_SECONDS = 1
_rate_hits: dict[str, list[float]] = {}
_rate_lock = threading.Lock()


@app.middleware("http")
async def protect_requests(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        if len(request.url.query) > _MAX_QUERY_LENGTH:
            return JSONResponse(status_code=400, content={"error": {"code": "query_too_large", "message": "Query parameters exceed the allowed size"}})
        now = time.monotonic()
        client = request.client.host if request.client else "unknown"
        with _rate_lock:
            hits = [stamp for stamp in _rate_hits.get(client, []) if now - stamp < _RATE_WINDOW_SECONDS]
            if len(hits) >= _RATE_MAX_REQUESTS:
                return JSONResponse(
                    status_code=429,
                    content={"error": {"code": "rate_limited", "message": "Too many requests"}},
                    headers={"Retry-After": str(_RATE_WINDOW_SECONDS)},
                )
            hits.append(now)
            _rate_hits[client] = hits
            if len(_rate_hits) > 2048:
                for key in list(_rate_hits)[:512]:
                    _rate_hits.pop(key, None)
    return await call_next(request)


@app.exception_handler(CalendarApiError)
async def calendar_api_error_handler(request: Request, exc: CalendarApiError):
    return JSONResponse(status_code=exc.status_code, content=exc.to_response())


@app.exception_handler(Exception)
async def safe_unexpected_error_handler(request: Request, exc: Exception):
    # Deliberately do not return exception text, paths, or traceback to clients.
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "Calendar API request failed"}},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/calendar/month")
async def calendar_month(request: Request):
    params = request.query_params
    try:
        year = _parse_int(params, "year", required=True)
        month = _parse_int(params, "month", required=True)
    except (ValueError, TypeError):
        return _error(400, "invalid_month", "year and month must be integers")
    if not 1 <= month <= 12:
        return _error(422, "invalid_month", "month must be between 1 and 12")
    try:
        start = date(year, month, 1)
        if month == 12:
            end = date(year, 12, 31)
        else:
            end = date(year, month + 1, 1) - timedelta(days=1)
    except ValueError:
        return _error(422, "invalid_month", "year must be supported by the calendar")
    return await _calendar_response(params, start, end)


@app.get("/api/calendar/day")
async def calendar_day(request: Request):
    raw_date = request.query_params.get("date")
    if raw_date is None:
        return _error(400, "missing_date", "date is required in YYYY-MM-DD format")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_date):
        return _error(400, "invalid_date", "date must use YYYY-MM-DD format")
    try:
        parsed = date.fromisoformat(raw_date)
    except ValueError:
        return _error(422, "invalid_date", "date must be a real calendar date")
    return await _calendar_response(request.query_params, parsed, parsed)


async def _calendar_response(params, start: date, end: date):
    try:
        filters = _parse_filters(params)
    except QueryParameterError as exc:
        return _error(exc.status_code, exc.code, str(exc))
    except ValueError as exc:
        return _error(400, "invalid_query_parameter", str(exc))
    filter_key = (
        tuple(tuple(filters[name] or ()) for name in ("modules", "traditions", "countries"))
        + tuple(filters[name] for name in ("locale", "user_timezone", "city_name", "latitude", "longitude"))
    )
    request_key = (start.isoformat(), end.isoformat(), *filter_key)
    month_start = date(start.year, start.month, 1)
    month_end = (
        date(start.year, 12, 31)
        if start.month == 12
        else date(start.year, start.month + 1, 1) - timedelta(days=1)
    )
    compute_key = (month_start.isoformat(), month_end.isoformat(), *filter_key)

    cached = _cache_get(request_key)
    if cached is not None:
        return cached

    # The core generates a full month even for a single-day request. Reuse that
    # month result across day requests, then select only the requested day's events.
    if start == end and compute_key != request_key:
        cached_month = _cache_get(compute_key)
        if cached_month is not None:
            day_result = _filter_day_result(cached_month, start)
            return _cache_day_response(request_key, day_result)

    # Coalesce requests for the same month and filters, including day and month routes.
    with _inflight_lock:
        task = _inflight_tasks.get(compute_key)
        if task is None:
            task = asyncio.create_task(_compute_and_cache(compute_key, month_start, month_end, filters))
            _inflight_tasks[compute_key] = task
            task.add_done_callback(lambda completed, cache_key=compute_key: _forget_inflight(cache_key, completed))
    result = await asyncio.shield(task)
    if isinstance(result, JSONResponse):
        return result
    if start == end:
        result = _filter_day_result(result, start)
    return _cache_day_response(request_key, result)


def _filter_day_result(month_result: dict[str, Any], day: date) -> dict[str, Any]:
    day_text = day.isoformat()
    events = month_result.get("events", [])
    filtered = []
    for event in events:
        display_dates = event.get("display_dates")
        if isinstance(display_dates, list):
            belongs_to_day = day_text in display_dates
        else:
            event_start = event.get("start_date")
            event_end = event.get("end_date") or event_start
            belongs_to_day = bool(event_start and event_start <= day_text <= event_end)
        if belongs_to_day:
            filtered.append(event)
    return {**month_result, "events": filtered}


def _cache_day_response(key, result):
    try:
        response_size = len(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError):
        return _error(500, "internal_error", "Calendar API request failed")
    if response_size > _MAX_RESPONSE_BYTES:
        return _error(413, "response_too_large", "Calendar response exceeds the allowed size")
    _cache_set(key, result)
    return result


async def _compute_and_cache(key, start: date, end: date, filters: dict[str, Any]):
    try:
        await asyncio.wait_for(_compute_slots.acquire(), timeout=_SLOT_WAIT_SECONDS)
    except asyncio.TimeoutError:
        return _error(503, "server_busy", "Calendar service is busy; retry later")

    # Another request may have filled the cache while this task waited for a slot.
    cached = _cache_get(key)
    if cached is not None:
        _compute_slots.release()
        return cached

    calculation = asyncio.create_task(asyncio.to_thread(calendar_events_response, start, end, **filters))
    defer_slot_release = False
    try:
        result = await asyncio.wait_for(asyncio.shield(calculation), timeout=_COMPUTE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        defer_slot_release = True
        calculation.add_done_callback(_release_compute_slot)
        return _error(503, "calculation_timeout", "Calendar calculation timed out; retry later")
    except CalendarApiError as exc:
        return JSONResponse(status_code=exc.status_code, content=exc.to_response())
    except Exception:
        return _error(500, "internal_error", "Calendar API request failed")
    finally:
        if not defer_slot_release:
            _compute_slots.release()
    try:
        response_size = len(json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError):
        return _error(500, "internal_error", "Calendar API request failed")
    # Oversized month results are not cached. The caller validates the final
    # response size after a day request has been filtered to one date.
    if response_size <= _MAX_RESPONSE_BYTES:
        _cache_set(key, result)
    return result


def _forget_inflight(key, task: asyncio.Task) -> None:
    with _inflight_lock:
        if _inflight_tasks.get(key) is task:
            _inflight_tasks.pop(key, None)


def _release_compute_slot(task: asyncio.Task) -> None:
    try:
        if not task.cancelled():
            task.exception()
    except Exception:
        pass
    _compute_slots.release()


def _parse_int(params, name: str, required: bool = False):
    value = params.get(name)
    if value is None:
        if required:
            raise ValueError(name)
        return None
    if not value or value.strip() != value:
        raise ValueError(name)
    return int(value)


def _parse_filters(params) -> dict[str, Any]:
    result: dict[str, Any] = {}
    allowed = {
        "modules": set(MODULES),
        "traditions": {"astronomy", "theravada", "mahayana", "hindu", "misc"},
        "countries": {meta.country for meta in MODULES.values() if meta.country},
    }
    for name, valid in allowed.items():
        raw = params.get(name)
        if raw is None:
            result[name] = None
            continue
        parts = raw.split(",")
        if any(not part or part.strip() != part for part in parts):
            raise ValueError(f"{name} must be a comma-separated list without empty values")
        if len(set(parts)) != len(parts):
            raise ValueError(f"{name} must not contain duplicates")
        if any(part not in valid for part in parts):
            raise QueryParameterError(422, f"invalid_{name}", f"{name} contains unsupported values")
        result[name] = parts

    # The restored core has no public traditions=misc filter, but its metadata
    # identifies the existing misc sources (currently fun_dates). Translate
    # this WEB contract to a module filter instead of changing the core.
    traditions = result["traditions"]
    if traditions and "misc" in traditions:
        if len(traditions) != 1:
            raise QueryParameterError(
                422,
                "unsupported_tradition_combination",
                "traditions=misc cannot be combined with other traditions",
            )
        misc_modules = [
            module_id for module_id, metadata in MODULES.items()
            if getattr(metadata, "tradition", None) == "misc"
        ]
        requested_modules = result["modules"]
        result["modules"] = (
            misc_modules if requested_modules is None
            else [module_id for module_id in requested_modules if module_id in misc_modules]
        )
        result["traditions"] = None

    locale = params.get("locale", "ru")
    if locale not in {"ru", "en"}:
        raise QueryParameterError(422, "invalid_locale", "locale must be ru or en")
    timezone = params.get("user_timezone", "UTC")
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise QueryParameterError(422, "invalid_timezone", "user_timezone must be a valid IANA timezone") from None
    city = params.get("city_name")
    if city is not None and len(city.strip()) > 120:
        raise QueryParameterError(422, "city_name_too_long", "city_name must not exceed 120 characters")
    latitude = _parse_float(params, "latitude", -90, 90)
    longitude = _parse_float(params, "longitude", -180, 180)
    if (latitude is None) != (longitude is None):
        raise QueryParameterError(422, "invalid_location", "latitude and longitude must be provided together")
    result.update(
        locale=locale,
        user_timezone=timezone,
        city_name=city,
        latitude=latitude,
        longitude=longitude,
    )
    return result


def _parse_float(params, name: str, minimum: float, maximum: float):
    raw = params.get(name)
    if raw is None:
        return None
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(f"{name} must be a number") from None
    if not (minimum <= value <= maximum):
        raise QueryParameterError(422, f"invalid_{name}", f"{name} must be between {minimum} and {maximum}")
    return value


def _cache_get(key):
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        expires, value = entry
        if expires <= now:
            _cache.pop(key, None)
            return None
        _cache.move_to_end(key)
        return value


def _cache_set(key, value):
    now = time.monotonic()
    with _cache_lock:
        _cache[key] = (now + _CACHE_TTL_SECONDS, value)
        _cache.move_to_end(key)
        while len(_cache) > _CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)


def _error(status: int, code: str, message: str):
    headers = {}
    if status == 503 and code == "server_busy":
        headers["Retry-After"] = "2"
    elif status == 503 and code == "calculation_timeout":
        headers["Retry-After"] = "5"
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


# Keep CORS outside the FastAPI middleware stack so it also decorates early
# responses (for example rate-limit and query-size errors).
app = CORSMiddleware(
    app=app,
    allow_origins=_allowed_origins,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
    expose_headers=["Retry-After"],
)


if __name__ == "__main__":
    # Enzonic standard Python service starts this file directly.
    # Prefer its SERVER_PORT; retain PORT for local/container compatibility.
    import uvicorn

    _port = int(os.environ.get("SERVER_PORT") or os.environ.get("PORT") or "8000")
    uvicorn.run(app, host="0.0.0.0", port=_port, log_level="info")
