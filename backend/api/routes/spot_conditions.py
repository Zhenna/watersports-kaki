import asyncio
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from services import conditions_repo as repo
from services.conditions_rules import evaluate
from services.conditions_service import build_observation, build_payload
from services.feed_cache import FeedCache
from services.nea import get_wind_speed, get_wind_direction, get_lightning

router = APIRouter()

LEVELS = {"never_tried", "beginner", "intermediate", "advanced"}
cache = FeedCache(ttl_seconds=60)


def _preview_mode() -> bool:
    """Local testing only: allows non-public spots and unreviewed rules and sectors."""
    return os.getenv("WSK_SHOW_PRIVATE_SPOTS") == "1"


@router.get("/{slug}/conditions")
async def spot_conditions(
    slug: str,
    background: BackgroundTasks,
    activity: str = Query(..., min_length=1, max_length=30),
    level: str = Query("beginner"),
):
    if level not in LEVELS:
        raise HTTPException(status_code=422, detail=f"level must be one of {sorted(LEVELS)}")
    preview = _preview_mode()

    try:
        ctx = await run_in_threadpool(repo.load_context, slug, activity, level, preview)
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
    publish = preview or assessment.review_status != "unreviewed"

    log_entries = [
        {"source": "nea", "feed": feed, "ok": info["ok"], "error": info["error"],
         "duration_ms": info["duration_ms"]}
        for feed, info in (("wind", wind_info), ("wind-direction", dir_info), ("lightning", li_info))
        if not info["cached"]
    ]
    background.add_task(repo.log_fetches, log_entries)

    spot = {"slug": ctx.slug, "name": ctx.name, "lat": ctx.lat, "lng": ctx.lng}
    return build_payload(spot, ctx.activity_slug, level, obs, meta, assessment, publish)
