# Birdle: Marsh Madness

Drag a spotting scope across the marsh and identify all 11 hidden birds before the 60-second timer runs out.

## Run

```bash
npm run serve
```

Open `http://localhost:4173`.

## Supabase leaderboard

Run `supabase/marsh_madness_leaderboard.sql` in the Supabase SQL editor before publishing the leaderboard build. The migration creates or upgrades `marsh_madness_leaderboard` with `player_label`, which the app uses when a completed round qualifies for the Regular or Expert top five.
