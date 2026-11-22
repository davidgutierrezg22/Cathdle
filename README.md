# 🍓 Catchdle

How much of a beatmap do you need to recognize it? Catchdle has three daily guessing games for osu!catch players, inspired by LoLdle and Pokédle. Everyone gets the same challenge in each mode. The next round starts at midnight in Colombia (UTC−5).

[Play Catchdle](https://cathdle.onrender.com) with your osu! account. Search for a guess by song title, artist or mapper.

## The three modes

| Mode | Guesses | How it works |
| --- | ---: | --- |
| Classic | 10 | Guess the beatmapset. Each guess compares the artist, mapper, stars, BPM, length and year with the daily map. |
| Background | 10 | Recognize the map from its background. The first crop starts at 12× zoom. Each miss reveals more of the picture. |
| Audio | 6 | Name the song from a one-second clip. After each miss you can hear more, up to 2, 4, 6, 8 and finally 10 seconds. Any set with the same artist and title counts. |

Background and Audio each have three daily challenges. Easy draws from the most-played third of the catalog, Medium from the middle third and Hard from the least-played third, using osu!'s total play count for each beatmapset. Each difficulty saves its own guesses. Your profile and leaderboard count completed rounds across difficulties within each mode.

In Classic, green means a match and yellow means you're close. If BPM shows an up arrow, try a faster song. The year comes from the date the set became Ranked or Loved. A yellow year is one year off. After three guesses you can reveal CS, AR, OD and HP. The difficulty name unlocks after five guesses. You can reveal the background before your tenth and final guess.

A first-guess Classic win earns 100 points. Each extra guess takes 10 points off a win. Open your profile to see your wins and streaks in each mode. Each mode also has its own leaderboard.

## Which maps are in the game?

The November 2026 catalog contains 4,047 Ranked and Loved beatmapsets with an osu!catch difficulty. A set with several catch difficulties appears once. Its highest-star catch difficulty supplies the stats and clues. The full list is in [data/beatmaps.json](data/beatmaps.json).

## Run it locally

The project uses Python 3.13 and FastAPI, with plain HTML, CSS and JavaScript on the frontend.

```sh
git clone https://github.com/davidgutierrezg22/Cathdle.git
cd Cathdle
python -m pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET` from your osu! OAuth application. Set its callback URL to `http://localhost:8000/auth/callback`.

```sh
python -m uvicorn server.app:app --reload
```

Open [localhost:8000](http://localhost:8000) and sign in. Local games use SQLite by default. The live game on Render stores all three modes in one PostgreSQL database on Neon, configured through `DATABASE_URL`. See the [Render setup guide](DEPLOY_RENDER.md) for deployment settings.
