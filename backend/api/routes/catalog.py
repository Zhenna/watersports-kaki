from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from services import conditions_repo as repo

router = APIRouter()


@router.get("/activities")
async def activities():
    """Activities that have a conditions view. Driven by data, so adding one needs no deploy."""
    return {"activities": await run_in_threadpool(repo.list_conditions_activities)}


@router.get("/spots")
async def spots(activity: str = Query(..., min_length=1, max_length=30)):
    """Public locations that support the activity."""
    try:
        items = await run_in_threadpool(repo.list_spots_for_activity, activity, repo.preview_mode())
    except repo.NotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"activity": activity, "spots": items}
