# Architecture notes

## Check-in flow
1. App requests user GPS (foreground only)
2. POST /api/checkins with {user_id, sport, lat, lng}
3. Backend loads spots from DB, runs haversine against user coords
4. If within CHECKIN_RADIUS_METRES (300m default) → write checkin record
5. Return confirmed spot name to app

## Credibility score (v1)
- Total check-ins (all sports)
- Check-ins per sport (drives per-sport bar on profile)
- Sessions organised (future)
- Member since date

## Ad targeting signals (all derived from checkins)
- sport preference (most checked-in sport)
- skill level (self-indicated on profile)
- usual spots (most frequent check-in locations)
- activity recency (last check-in date)
- frequency (check-ins per month)

## Lightning alert logic
- Poll /api/weather/lightning every 2 min
- Compute distance from user's last known location to each strike
- < 20km → in-app warning banner
- < 10km → push notification + hard warning screen
