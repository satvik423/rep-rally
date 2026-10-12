# Rep Rally — Workout tracker

A small local-first workout planner built as an installable web app. Your plans, settings, workout history, and in-progress timer are stored in this browser with `localStorage`; there is no account or cloud sync.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To make a production build, run `npm run build`; the site is written to `dist/`.

## Use on a phone

Deploy the contents of `dist/` to a static host with HTTPS, then open that URL on your phone and use the browser’s install or add-to-home-screen action. Data is separate for each browser/device.

## Workout flow

- Add a muscle tree rooted at Body and create exercises linked to any muscle.
- Set global set and rep defaults; each exercise in a plan can override either value.
- Assign plans to recurring weekdays. Plans without a weekday stay in the archive.
- Start an exercise to time each set. Finishing a set starts the rest interval; resuming the next set closes it.
- Saving the exercise stores reps, weight and unit, work time, and between-set rest time.
- Suggestions use the most recent session for that exercise. A missed set target repeats; completing it adds one set until the configured target is reached.
