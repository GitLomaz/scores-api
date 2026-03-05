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
const mysql = require("mysql2/promise");

const app = express();

// ---- CORS (open, no credentials) ----
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
  })
);
app.options(/.*/, cors());

// ---- Body parsing ----
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ---- DB config via env ----
const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS || "";
const DB_NAME = process.env.DB_NAME;

if (!DB_HOST || !DB_USER || !DB_NAME) {
  console.error("Missing DB env vars. Need DB_HOST, DB_USER, DB_PASS, DB_NAME.");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8080);

let pool;
async function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  return pool;
}

function safeBase64JsonDecode(b64) {
  const raw = Buffer.from(String(b64 || ""), "base64").toString("utf8");
  return JSON.parse(raw);
}

async function fetchTopScores(conn, game) {
  const [rows] = await conn.execute(
    "SELECT name, score FROM score WHERE game = ? ORDER BY score DESC LIMIT 10",
    [game]
  );
  return rows.map((r) => ({ name: r.name, score: Number(r.score) }));
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/scores", async (req, res) => {
  const game = (req.query.game || "").toString();
  if (!game) return res.status(400).json({ error: "Missing ?game=" });

  try {
    const p = await getPool();
    const conn = await p.getConnection();
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

    const scoreNum = Number(score);
    if (!Number.isFinite(scoreNum)) {
      return res.status(400).json({ error: "score must be a number" });
    }

    const p = await getPool();
    const conn = await p.getConnection();

    try {
      const [existing] = await conn.execute(
        "SELECT 1 FROM score WHERE name = ? AND score = ? AND game = ? LIMIT 1",
        [name, scoreNum, game]
      );

      if (!existing || existing.length === 0) {
        query = "INSERT INTO score (name, score, game) values (?, ?, ?)";
        await conn.execute(query, [name, scoreNum, game]);
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
        const [posRows] = await conn.execute(
          "SELECT COUNT(*) AS c FROM score WHERE game = ? AND score > ?",
          [game, scoreNum]
        );
        const position = Number(posRows?.[0]?.c ?? 0);
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Scores API listening on port ${PORT}`);
});
