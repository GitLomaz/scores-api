/**
 * Scores API (Express + mysql2/promise)
 *
 * Routes:
 *  - GET  /scores?game=yourgame
 *  - POST /scores  with body: { data: "<base64 of json>" } or urlencoded data=...
 *  - GET  /health
 */
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex");
  next();
});

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
  })
);
app.options(/.*/, cors());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable.");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8080);

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

async function getPool() {
  return pool;
}

function safeBase64JsonDecode(b64) {
  const raw = Buffer.from(String(b64 || ""), "base64").toString("utf8");
  return JSON.parse(raw);
}

async function fetchTopScores(conn, game) {
  const result = await conn.query(
    "SELECT name, score FROM score WHERE game = $1 ORDER BY score DESC LIMIT 10",
    [game]
  );
  console.log(JSON.stringify(result.rows));
  return result.rows.map((r) => ({ name: r.name, score: Number(r.score) }));
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/scores", async (req, res) => {
  const game = (req.query.game || "").toString();
  
  console.warn(`[INFO] - GET called for: ${game}`)
  if (!game) return res.status(400).json({ error: "Missing ?game=" });

  try {
    const p = await getPool();
    const conn = await p.connect();
    try {
      const scores = await fetchTopScores(conn, game);
      return res.json({ scores, query: "nope!" });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/scores", async (req, res) => {
  const b64 = req.body?.data;

  let name = null;
  let score = null;
  let game = null;
  let query = "nope!";

  try {
    const obj = safeBase64JsonDecode(b64);

    score = obj?.score;
    name = obj?.name;
    game = obj?.game;

    if (!name || score === null || score === undefined || !game) {
      return res.status(400).json({ error: "Missing name/score/game in payload" });
    }
    console.warn(`[INFO] - POST called for: ${game}`)
    const scoreNum = Number(score);
    if (!Number.isFinite(scoreNum)) {
      return res.status(400).json({ error: "score must be a number" });
    }

    const p = await getPool();
    const conn = await p.connect();

    try {
      const result = await conn.query(
        "SELECT 1 FROM score WHERE name = $1 AND score = $2 AND game = $3 LIMIT 1",
        [name, scoreNum, game]
      );

      if (!result.rows || result.rows.length === 0) {
        query = "INSERT INTO score (name, score, game) values ($1, $2, $3)";
        await conn.query(query, [name, scoreNum, game]);
      }

      const scores = await fetchTopScores(conn, game);

      let searchScore = true;
      for (const s of scores) {
        if (s.name === name && s.score === scoreNum) {
          searchScore = false;
          break;
        }
      }

      const response = { scores, query };

      if (searchScore) {
        const posResult = await conn.query(
          "SELECT COUNT(*) AS c FROM score WHERE game = $1 AND score > $2",
          [game, scoreNum]
        );
        const position = Number(posResult.rows?.[0]?.c ?? 0);
        response.position = position;
        response.name = String(name);
        response.score = String(scoreNum);
      }

      return res.json(response);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.all('*', (req, res) => {
  res.sendStatus(204);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Scores API listening on port ${PORT}`);
});
