import asyncio

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from services import conditions_repo as repo
from services.conditions_rules import evaluate
from services.conditions_service import build_observation, build_payload
from services.feed_cache import FeedCache
from services.forecast import (
    build_days, build_forecast_payload, parse_24h, parse_four_day, rules_reviewed,
)
from services.nea import get_wind_speed, get_wind_direction, get_lightning
from services.nea_forecast import get_24h_forecast, get_four_day_outlook

router = APIRouter()

LEVELS = {"never_tried", "beginner", "intermediate", "advanced"}
cache = FeedCache(ttl_seconds=60)
forecast_cache = FeedCache(ttl_seconds=900)   # the 4-day outlook updates every 12 hours


@router.get("/{slug}/conditions")
async def spot_conditions(
    slug: str,
    background: BackgroundTasks,
    activity: str = Query(..., min_length=1, max_length=30),
    level: str = Query("beginner"),
):
    if level not in LEVELS:
        raise HTTPException(status_code=422, detail=f"level must be one of {sorted(LEVELS)}")
    preview = repo.preview_mode()
    provisional = repo.provisional_guidance()

    try:
        ctx = await run_in_threadpool(repo.load_context, slug, activity, level, preview, provisional)
    except repo.NotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except repo.NotSupported as e:
        raise HTTPException(status_code=422, detail=str(e))

    (wind, wind_info), (direction, dir_info), (lightning, li_info) = await asyncio.gather(
        cache.get("wind", get_wind_speed),
        cache.get("wind-direction", get_wind_direction),
        cache.get("lightning", get_lightning),
    )

    obs, meta = build_observation(
        wind, direction, lightning, ctx.lat, ctx.lng,
        preferred_station_id=ctx.nea_station_id,
    )
    assessment = evaluate(
        ctx.activity_slug, level, obs, ctx.rules,
        wind_dependent=ctx.wind_dependent, sectors=ctx.sectors,
    )
    publish = preview or provisional or assessment.review_status != "unreviewed"

    log_entries = [
        {"source": "nea", "feed": feed, "ok": info["ok"], "error": info["error"],
         "duration_ms": info["duration_ms"]}
        for feed, info in (("wind", wind_info), ("wind-direction", dir_info), ("lightning", li_info))
        if not info["cached"]
    ]
    background.add_task(repo.log_fetches, log_entries)

    spot = {"slug": ctx.slug, "name": ctx.name, "lat": ctx.lat, "lng": ctx.lng}
    return build_payload(spot, ctx.activity_slug, level, obs, meta, assessment, publish)


@router.get("/{slug}/forecast")
async def spot_forecast(
    slug: str,
    background: BackgroundTasks,
    activity: str = Query(..., min_length=1, max_length=30),
    level: str = Query("beginner"),
):
    """Island-wide NEA forecast for the next 4 days, assessed against the same reference ranges."""
    if level not in LEVELS:
        raise HTTPException(status_code=422, detail=f"level must be one of {sorted(LEVELS)}")
    preview = repo.preview_mode()
    provisional = repo.provisional_guidance()

    try:
        ctx = await run_in_threadpool(repo.load_context, slug, activity, level, preview, provisional)
    except repo.NotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except repo.NotSupported as e:
        raise HTTPException(status_code=422, detail=str(e))

    (four_raw, four_info), (h24_raw, h24_info) = await asyncio.gather(
        forecast_cache.get("four-day-outlook", get_four_day_outlook),
        forecast_cache.get("twenty-four-hr-forecast", get_24h_forecast),
    )
    four = parse_four_day(four_raw) if four_raw else None
    h24 = parse_24h(h24_raw) if h24_raw else None

    publish = preview or provisional or (not ctx.wind_dependent) or rules_reviewed(ctx.rules, ctx.activity_slug, level)
    days = build_days(four, h24, ctx.forecast_region, ctx.rules, ctx.activity_slug, level,
                      ctx.wind_dependent, ctx.sectors, publish)

    log_entries = []
    for feed, raw, parsed, info in (("four-day-outlook", four_raw, four, four_info),
                                    ("twenty-four-hr-forecast", h24_raw, h24, h24_info)):
        if info["cached"]:
            continue
        ok = info["ok"] and (raw is None or parsed is not None)
        error = info["error"] or (None if ok else "response shape not recognised")
        log_entries.append({"source": "nea", "feed": feed, "ok": ok, "error": error,
                            "duration_ms": info["duration_ms"]})
    background.add_task(repo.log_fetches, log_entries)

    spot = {"slug": ctx.slug, "name": ctx.name, "lat": ctx.lat, "lng": ctx.lng}
    return build_forecast_payload(spot, ctx.activity_slug, level, days, available=bool(four or h24))
