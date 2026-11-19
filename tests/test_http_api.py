import sys
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_process_state():
    with main._cache_lock:
        main._cache.clear()
    with main._rate_lock:
        main._rate_hits.clear()
    yield


def test_health_does_not_calculate_calendar():
    with patch.object(main, "calendar_events_response", side_effect=AssertionError("called")):
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_month_route_uses_inclusive_month_bounds():
    with patch.object(main, "calendar_events_response", return_value={"events": []}) as calculate:
        response = client.get("/api/calendar/month?year=2024&month=2")
    assert response.status_code == 200
    assert calculate.call_args.args[:2] == (date(2024, 2, 1), date(2024, 2, 29))


def test_day_route_uses_month_result_and_filters_requested_date():
    month_events = {
        "events": [
            {"id": "selected-day", "display_dates": ["2026-11-19"]},
            {"id": "other-day", "display_dates": ["2026-11-20"]},
        ]
    }
    with patch.object(main, "calendar_events_response", return_value=month_events) as calculate:
        response = client.get("/api/calendar/day?date=2026-11-19")
    assert response.status_code == 200
    assert calculate.call_args.args[:2] == (date(2026, 11, 1), date(2026, 11, 30))
    assert response.json()["events"] == [month_events["events"][0]]


def test_different_day_requests_reuse_cached_month_result():
    month_events = {
        "events": [
            {"id": "day-one", "display_dates": ["2026-11-18"]},
            {"id": "day-two", "display_dates": ["2026-11-19"]},
        ]
    }
    with patch.object(main, "calendar_events_response", return_value=month_events) as calculate:
        first = client.get("/api/calendar/day?date=2026-11-18")
        second = client.get("/api/calendar/day?date=2026-11-19")
    assert first.status_code == second.status_code == 200
    assert first.json()["events"] == [month_events["events"][0]]
    assert second.json()["events"] == [month_events["events"][1]]
    assert calculate.call_count == 1


def test_rejects_invalid_month_and_date():
    assert client.get("/api/calendar/month?year=2026&month=13").status_code == 422
    assert client.get("/api/calendar/day?date=2026-02-30").status_code == 422


def test_rejects_invalid_timezone_and_location_pair():
    assert client.get("/api/calendar/day?date=2026-11-19&user_timezone=Not/AZone").status_code == 422
    assert client.get("/api/calendar/day?date=2026-11-19&latitude=10").status_code == 422


def test_rejects_duplicate_and_empty_filters():
    assert client.get("/api/calendar/day?date=2026-11-19&modules=moon,moon").status_code == 400
    assert client.get("/api/calendar/day?date=2026-11-19&modules=moon,,sun").status_code == 400


def test_misc_filter_is_translated_to_existing_core_modules():
    with patch.object(main, "calendar_events_response", return_value={"events": []}) as calculate:
        response = client.get("/api/calendar/month?year=2026&month=11&traditions=misc")
    assert response.status_code == 200
    assert calculate.call_args.kwargs["modules"] == ["fun_dates"]
    assert calculate.call_args.kwargs["traditions"] is None


def test_misc_filter_works_with_restored_core():
    response = client.get("/api/calendar/day?date=2026-02-14&traditions=misc")
    assert response.status_code == 200
    assert all(event["module"] == "fun_dates" for event in response.json()["events"])


def test_real_core_accepts_supported_module_and_country_filter():
    response = client.get(
        "/api/calendar/day?date=2026-02-14&modules=moon&countries=China"
    )
    assert response.status_code == 200


def test_errors_do_not_leak_exception_details():
    with patch.object(main, "calendar_events_response", side_effect=RuntimeError("C:\\private\\secret")):
        response = client.get("/api/calendar/day?date=2026-11-19")
    assert response.status_code == 500
    assert "private" not in response.text
    assert "secret" not in response.text


def test_rate_limit_returns_retry_after():
    import time

    main._rate_hits["testclient"] = [time.monotonic()] * main._RATE_MAX_REQUESTS
    response = client.get(
        "/api/health",
        headers={"Origin": "https://tssrkt.github.io"},
    )
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "rate_limited"
    assert response.headers["retry-after"] == "60"
    assert response.headers["access-control-expose-headers"] == "Retry-After"


def test_expired_rate_limit_hits_do_not_block_requests():
    import time

    expired = time.monotonic() - main._RATE_WINDOW_SECONDS - 1
    main._rate_hits["testclient"] = [expired] * main._RATE_MAX_REQUESTS
    response = client.get("/api/health")
    assert response.status_code == 200
    assert len(main._rate_hits["testclient"]) == 1
    assert main._rate_hits["testclient"][0] > expired


def test_cors_allows_only_configured_origins():
    main._rate_hits.pop("testclient", None)
    allowed = client.get("/api/health", headers={"Origin": "https://tssrkt.github.io"})
    denied = client.get("/api/health", headers={"Origin": "https://example.invalid"})
    assert allowed.headers["access-control-allow-origin"] == "https://tssrkt.github.io"
    assert "access-control-allow-origin" not in denied.headers


def test_cors_preflight_bypasses_rate_limit():
    import time

    main._rate_hits["testclient"] = [time.monotonic()] * main._RATE_MAX_REQUESTS
    response = client.options(
        "/api/calendar/day",
        headers={
            "Origin": "https://tssrkt.github.io",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://tssrkt.github.io"
    assert "GET" in response.headers["access-control-allow-methods"]
    assert len(main._rate_hits["testclient"]) == main._RATE_MAX_REQUESTS


def test_query_string_size_is_bounded_and_cors_is_present():
    response = client.get(
        "/api/calendar/day?date=2026-11-19&x=" + "x" * 5000,
        headers={"Origin": "https://tssrkt.github.io"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "query_too_large"
    assert response.headers["access-control-allow-origin"] == "https://tssrkt.github.io"


def test_disallowed_origin_cannot_use_cors_preflight():
    response = client.options(
        "/api/calendar/day",
        headers={
            "Origin": "https://example.invalid",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_response_size_is_bounded():
    oversized = {"events": [{"display_dates": ["2026-11-19"], "description": "x" * (main._MAX_RESPONSE_BYTES + 1)}]}
    with patch.object(main, "calendar_events_response", return_value=oversized):
        response = client.get("/api/calendar/day?date=2026-11-19")
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "response_too_large"


def test_calculation_timeout_returns_safe_503(monkeypatch):
    import time

    monkeypatch.setattr(main, "_COMPUTE_TIMEOUT_SECONDS", 0.01)
    with patch.object(main, "calendar_events_response", side_effect=lambda *args, **kwargs: (time.sleep(0.08) or {"events": []})):
        response = client.get("/api/calendar/day?date=2026-11-20")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "calculation_timeout"
    assert response.headers["retry-after"] == "5"
    time.sleep(0.12)


def test_identical_requests_use_response_cache():
    with patch.object(main, "calendar_events_response", return_value={"events": []}) as calculate:
        first = client.get("/api/calendar/day?date=2026-11-22")
        second = client.get("/api/calendar/day?date=2026-11-22")
    assert first.status_code == second.status_code == 200
    assert calculate.call_count == 1


def test_cache_key_distinguishes_calendar_filters():
    variants = [
        {"modules": "moon"},
        {"modules": "sun"},
        {"modules": "moon", "traditions": "astronomy"},
        {"modules": "moon", "countries": "China"},
        {"modules": "moon", "locale": "en"},
        {"modules": "moon", "user_timezone": "Europe/Athens"},
        {"modules": "moon", "city_name": "Athens"},
        {"modules": "moon", "latitude": "10", "longitude": "20"},
    ]
    with patch.object(main, "calendar_events_response", return_value={"events": []}) as calculate:
        responses = [
            client.get("/api/calendar/day", params={"date": "2026-11-26", **variant})
            for variant in variants
        ]
    assert all(response.status_code == 200 for response in responses)
    assert calculate.call_count == len(variants)


def test_request_rechecks_month_cache_before_calculation():
    cached_value = {"events": [{"id": "already-cached", "display_dates": ["2026-11-24"]}]}
    with patch.object(main, "_cache_get", side_effect=[None, None, cached_value]) as cache_get:
        with patch.object(main, "calendar_events_response") as calculate:
            response = client.get("/api/calendar/day?date=2026-11-24")
    assert response.status_code == 200
    assert response.json() == cached_value
    assert cache_get.call_count == 3
    calculate.assert_not_called()


def test_parallel_identical_requests_share_one_calculation():
    import asyncio
    import time
    import httpx

    async def exercise():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
            with patch.object(
                main,
                "calendar_events_response",
                side_effect=lambda *args, **kwargs: (time.sleep(0.08) or {"events": []}),
            ) as calculate:
                first, second = await asyncio.gather(
                    async_client.get("/api/calendar/day?date=2026-11-25"),
                    async_client.get("/api/calendar/day?date=2026-11-25"),
                )
        assert first.status_code == second.status_code == 200
        assert calculate.call_count == 1

    asyncio.run(exercise())


def test_parallel_different_days_in_same_month_share_one_calculation():
    import asyncio
    import time
    import httpx

    month_events = {
        "events": [
            {"id": "day-one", "display_dates": ["2026-11-25"]},
            {"id": "day-two", "display_dates": ["2026-11-26"]},
        ]
    }

    async def exercise():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
            with patch.object(
                main,
                "calendar_events_response",
                side_effect=lambda *args, **kwargs: (time.sleep(0.08) or month_events),
            ) as calculate:
                first, second = await asyncio.gather(
                    async_client.get("/api/calendar/day?date=2026-11-25"),
                    async_client.get("/api/calendar/day?date=2026-11-26"),
                )
        assert first.status_code == second.status_code == 200
        assert first.json()["events"] == [month_events["events"][0]]
        assert second.json()["events"] == [month_events["events"][1]]
        assert calculate.call_count == 1

    asyncio.run(exercise())


def test_full_compute_slots_return_safe_server_busy():
    import asyncio
    import httpx

    async def exercise():
        await main._compute_slots.acquire()
        await main._compute_slots.acquire()
        try:
            transport = httpx.ASGITransport(app=main.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
                response = await async_client.get(
                    "/api/calendar/day?date=2026-11-23",
                    headers={"Origin": "https://tssrkt.github.io"},
                )
        finally:
            main._compute_slots.release()
            main._compute_slots.release()
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "server_busy"
        assert response.headers["retry-after"] == "2"
        assert response.headers["access-control-allow-origin"] == "https://tssrkt.github.io"
        assert response.headers["access-control-expose-headers"] == "Retry-After"

    asyncio.run(exercise())
