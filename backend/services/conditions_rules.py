"""
Conditions interpretation rules (Conditions v3, F3 and F5).

Pure and deterministic: no network, no database. Callers load observations,
rules and wind sectors, then call evaluate().

Design rules:
- Never return a verdict. The output is a status, a plain summary, and flags,
  each traceable to a rule version and the measurements used.
- Fail closed. Missing, stale or invalid inputs never produce a favourable result.
  A missing rule for a wind-dependent activity means "unavailable", never "fine".
- "No strikes observed" is never presented as an all-clear.
- Rules that have not been reviewed by an instructor are labelled as such, and the
  caller must not publish guidance for them.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

RULES_ENGINE_VERSION = "1"

KMH_PER_KNOT = 1.852

# Freshness limits, in minutes (Full App v2, F2). Confirm against provider update rates.
WIND_STALE_MIN = 15
LIGHTNING_STALE_MIN = 10

# Defaults to confirm (Conditions v3, decision C6).
DEFAULT_LIGHTNING_RADIUS_KM = 20.0
DEFAULT_LIGHTNING_LOOKBACK_MIN = 30

BEGINNER_LEVELS = {"never_tried", "beginner"}

STATUS_UNAVAILABLE = "unavailable"
STATUS_FLAGGED = "flagged"
STATUS_OUTSIDE = "outside_reference_range"
STATUS_WITHIN = "within_reference_range"
STATUS_NOT_APPLICABLE = "wind_not_applicable"

_SEVERITY_ORDER = {"hazard": 0, "advise_against": 1, "caution": 2, "info": 3}


@dataclass
class Rule:
    activity_slug: str
    level: str
    condition_type: str  # e.g. "wind_speed_kmh"
    min_value: Optional[float]
    max_value: Optional[float]
    rule_version: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None


@dataclass
class WindSector:
    from_deg: float
    to_deg: float  # clockwise from from_deg; may wrap past 360
    direction_class: str  # onshore | cross_shore | offshore


@dataclass
class LightningObservation:
    strike_count: int
    nearest_km: Optional[float]
    age_min: Optional[float]  # minutes since the last successful fetch
    radius_km: float = DEFAULT_LIGHTNING_RADIUS_KM
    lookback_min: int = DEFAULT_LIGHTNING_LOOKBACK_MIN


@dataclass
class Observation:
    wind_kmh: Optional[float] = None
    gust_kmh: Optional[float] = None
    wind_from_deg: Optional[float] = None
    wind_age_min: Optional[float] = None
    # None means the lightning feed is unavailable. It must never be read as "none".
    lightning: Optional[LightningObservation] = None


@dataclass
class Flag:
    code: str
    severity: str  # hazard | advise_against | caution | info
    message: str
    data: dict = field(default_factory=dict)


@dataclass
class Assessment:
    status: str
    summary: str
    flags: list
    unavailable_reasons: list
    review_status: str  # reviewed | unreviewed | not_applicable
    rules_engine_version: str
    rule_version: Optional[str]
    inputs: dict
    # Wind assessed on its own, so a lightning flag never hides it (and is not repeated in it).
    wind_status: str = "unavailable"  # within | outside | unavailable | not_applicable
    wind_summary: Optional[str] = None
    wind_reasons: list = field(default_factory=list)
    # What this assessment actually covered.
    scope: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "summary": self.summary,
            "flags": [vars(f) for f in self.flags],
            "unavailable_reasons": self.unavailable_reasons,
            "review_status": self.review_status,
            "rules_engine_version": self.rules_engine_version,
            "rule_version": self.rule_version,
            "inputs": self.inputs,
            "wind_status": self.wind_status,
            "wind_summary": self.wind_summary,
            "wind_reasons": self.wind_reasons,
            "scope": self.scope,
        }


def _valid(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) and x >= 0


def kmh_to_knots(kmh: float) -> float:
    return kmh / KMH_PER_KNOT


def classify_direction(wind_from_deg: Optional[float], sectors: list) -> Optional[str]:
    """Return onshore, cross_shore or offshore for the sector containing the wind
    direction (the bearing the wind blows FROM), or None if unmapped."""
    if not _valid(wind_from_deg) or wind_from_deg > 360:
        return None
    a = wind_from_deg % 360
    for s in sectors:
        lo, hi = s.from_deg % 360, s.to_deg % 360
        inside = (lo <= a <= hi) if lo <= hi else (a >= lo or a <= hi)
        if inside:
            return s.direction_class
    return None


def _find_rule(rules: list, slug: str, level: str, condition_type: str) -> Optional[Rule]:
    for r in rules:
        if r.activity_slug == slug and r.level == level and r.condition_type == condition_type:
            return r
    return None


def evaluate(
    activity_slug: str,
    level: str,
    obs: Observation,
    rules: list,
    wind_dependent: bool = True,
    sectors: Optional[list] = None,
) -> Assessment:
    sectors = sectors or []
    flags: list = []
    reasons: list = []
    outside_note: Optional[str] = None
    within_note: Optional[str] = None
    review_status = "not_applicable"
    rule_version: Optional[str] = None
    wind_reasons: list = []
    direction_assessed = False
    gusts_assessed = False
    inputs: dict = {
        "activity": activity_slug,
        "level": level,
        "wind_kmh": obs.wind_kmh if _valid(obs.wind_kmh) else None,
        "wind_knots": round(kmh_to_knots(obs.wind_kmh), 1) if _valid(obs.wind_kmh) else None,
        "gust_kmh": obs.gust_kmh if _valid(obs.gust_kmh) else None,
        "wind_from_deg": obs.wind_from_deg if _valid(obs.wind_from_deg) else None,
        "wind_age_min": obs.wind_age_min,
    }

    # ---- lightning (always applies, any activity) ------------------------
    li = obs.lightning
    if li is None:
        reasons.append("lightning data unavailable")
    elif not _valid(li.age_min) or li.age_min > LIGHTNING_STALE_MIN:
        reasons.append("lightning data is out of date")
    else:
        inputs["lightning_strikes"] = li.strike_count
        inputs["lightning_nearest_km"] = li.nearest_km
        inputs["lightning_age_min"] = li.age_min
        near = (
            li.strike_count > 0
            and li.nearest_km is not None
            and _valid(li.nearest_km)
            and li.nearest_km <= li.radius_km
        )
        if near:
            flags.append(Flag(
                "lightning_observed", "hazard",
                f"Lightning detected nearby: {li.strike_count} strike(s) observed in the last "
                f"{li.lookback_min} minutes, nearest {li.nearest_km:.1f} km away (data "
                f"{li.age_min:.0f} min old). Follow official advisories and your operator's procedures.",
                {"nearest_km": li.nearest_km, "strikes": li.strike_count, "radius_km": li.radius_km},
            ))
        else:
            flags.append(Flag(
                "no_strikes_observed", "info",
                f"No strikes observed within {li.radius_km:.0f} km in the last {li.lookback_min} "
                f"minutes. This is not an all-clear. Data may be delayed.",
                {"radius_km": li.radius_km},
            ))

    # ---- wind (only for wind-dependent activities) -----------------------
    if wind_dependent:
        rule = _find_rule(rules, activity_slug, level, "wind_speed_kmh")
        if rule is None:
            wind_reasons.append(f"no WSK reference range for {activity_slug} at {level} level")
            reasons.append(f"no WSK reference range for {activity_slug} at {level} level")
        else:
            rule_version = rule.rule_version
            review_status = "reviewed" if rule.reviewed_by else "unreviewed"
            if review_status == "unreviewed":
                flags.append(Flag(
                    "rules_unreviewed", "info",
                    "These reference ranges have not been reviewed by an instructor.",
                    {"rule_version": rule.rule_version},
                ))

        if not _valid(obs.wind_kmh):
            wind_reasons.append("wind data unavailable")
            reasons.append("wind data unavailable")
        elif not _valid(obs.wind_age_min) or obs.wind_age_min > WIND_STALE_MIN:
            wind_reasons.append("wind data is out of date")
            reasons.append("wind data is out of date")
        elif rule is not None:
            lo, hi = rule.min_value, rule.max_value
            w = obs.wind_kmh
            w_txt = f"{w:.1f} km/h ({kmh_to_knots(w):.1f} knots)"
            rng = f"{lo:g} to {hi:g} km/h" if lo is not None and hi is not None else "no stated range"
            if hi is not None and w > hi:
                outside_note = (
                    f"Wind is {w_txt}, above the WSK reference range of {rng} for "
                    f"{level.replace('_', ' ')} {activity_slug}."
                )
            elif lo is not None and w < lo:
                outside_note = (
                    f"Wind is {w_txt}, below the WSK reference range of {rng} for "
                    f"{level.replace('_', ' ')} {activity_slug}."
                )
            else:
                within_note = (
                    f"Wind is {w_txt}, within the WSK reference range of {rng} for "
                    f"{level.replace('_', ' ')} {activity_slug}."
                )

            # gusts: supplementary, and never silently treated as benign
            if _valid(obs.gust_kmh):
                gusts_assessed = hi is not None
                if hi is not None and obs.gust_kmh > hi:
                    flags.append(Flag(
                        "gusts_above_reference", "caution",
                        f"Gusts of {obs.gust_kmh:.0f} km/h are above the reference maximum of {hi:g} km/h.",
                        {"gust_kmh": obs.gust_kmh, "max": hi},
                    ))
            else:
                flags.append(Flag(
                    "gusts_not_available", "info",
                    "Gust data is not available, so gusts are not part of this assessment.",
                ))

            # direction relative to the shore
            if not sectors:
                flags.append(Flag(
                    "direction_not_assessed", "info",
                    "Wind direction relative to the shore is not assessed for this spot yet.",
                ))
            elif not _valid(obs.wind_from_deg):
                flags.append(Flag(
                    "wind_direction_unavailable", "info",
                    "Wind direction data is unavailable, so shore-relative direction is not assessed.",
                ))
            else:
                cls = classify_direction(obs.wind_from_deg, sectors)
                direction_assessed = cls is not None
                if cls is None:
                    flags.append(Flag(
                        "direction_not_assessed", "info",
                        "This wind direction falls outside the mapped sectors for this spot.",
                        {"wind_from_deg": obs.wind_from_deg},
                    ))
                elif cls == "offshore":
                    if level in BEGINNER_LEVELS:
                        flags.append(Flag(
                            "offshore_wind_beginner", "advise_against",
                            "Offshore wind can make returning to shore difficult for beginners. "
                            "Independent practice is not recommended under this scenario.",
                            {"direction_class": cls},
                        ))
                    else:
                        flags.append(Flag(
                            "offshore_wind", "caution",
                            "Offshore wind: returning to shore can be harder.",
                            {"direction_class": cls},
                        ))
                elif cls == "cross_shore":
                    flags.append(Flag(
                        "cross_shore_wind", "info", "Wind is cross-shore.",
                        {"direction_class": cls},
                    ))

    flags.sort(key=lambda f: _SEVERITY_ORDER.get(f.severity, 9))

    # ---- the wind result on its own --------------------------------------
    wind_summary: Optional[str] = None
    if not wind_dependent:
        wind_status = "not_applicable"
    elif outside_note:
        wind_status = "outside"
        wind_summary = outside_note + " This is not a safety assessment."
    elif within_note:
        wind_status = "within"
        wind_summary = within_note + " This is not a safety clearance."
    else:
        wind_status = "unavailable"

    # ---- status: hazard flags first, then missing data, then wind --------
    has_hazard = any(f.severity in ("hazard", "advise_against") for f in flags)
    if has_hazard:
        status = STATUS_FLAGGED
        top = next(f for f in flags if f.severity in ("hazard", "advise_against"))
        summary = top.message
    elif reasons:
        status = STATUS_UNAVAILABLE
        summary = (
            "Assessment unavailable: " + "; ".join(reasons)
            + ". Check official advisories and conditions on site."
        )
    elif not wind_dependent:
        status = STATUS_NOT_APPLICABLE
        summary = (
            "Wind limits are not part of this activity's assessment. Lightning observations "
            "are shown with the flags. This is not a safety clearance."
        )
    elif outside_note:
        status = STATUS_OUTSIDE
        summary = outside_note + " This is not a safety assessment."
    else:
        status = STATUS_WITHIN
        summary = (within_note or "") + " This is not a safety clearance."

    return Assessment(
        status=status,
        summary=summary,
        flags=flags,
        unavailable_reasons=reasons,
        review_status=review_status,
        rules_engine_version=RULES_ENGINE_VERSION,
        rule_version=rule_version,
        inputs=inputs,
        wind_status=wind_status,
        wind_summary=wind_summary,
        wind_reasons=wind_reasons,
        scope={
            "wind_speed": wind_status in ("within", "outside"),
            "direction": direction_assessed,
            "gusts": gusts_assessed,
        },
    )
