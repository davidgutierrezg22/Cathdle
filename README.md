# 🍓 Catchdle

Catchdle is a daily guessing game for osu!catch players, inspired by LoLdle and Pokédle. Everyone gets the same beatmapset and ten guesses to find it. A new round starts at midnight in Colombia (UTC−5).

## How to play

Log in with osu! and pick a set you know. You can search by title, artist or mapper. Each guess shows how its artist, mapper, star rating, BPM and length compare with the mystery set. Green means a match. Yellow means a number is close, and an arrow tells you which way to go.

Say you get the artist right but see an up arrow next to BPM. Try a faster song by that artist. If two mappers made sets for the same song, it matters which one you pick. For sets with several catch difficulties, the game uses the one with the highest star rating.

If you're stuck, you get CS, AR, OD and HP after four guesses, the difficulty name after seven, and the background after nine. A first-guess win earns 100 points. Each extra guess takes 10 points off a win. Your profile keeps track of wins and streaks, and the leaderboard shows how your points stack up.

## Run it locally

The frontend is plain HTML, CSS and JavaScript. FastAPI serves the game and handles osu! login, and SQLite stores guesses and results.

```sh
git clone https://github.com/davidgutierrezg22/Cathdle.git
cd Cathdle
python -m pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET` from your osu! OAuth application. Set the application's callback URL to `http://localhost:8000/auth/callback` to match the local configuration.

```sh
python -m uvicorn server.app:app --reload
```

Open [localhost:8000](http://localhost:8000) and log in with osu! to play.
