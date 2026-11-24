const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    })
  : null;

function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN || typeof initData !== "string" || !initData) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return null;
  params.delete("hash");
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + value)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(receivedHash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const user = JSON.parse(params.get("user") || "null");
    if (!user || !Number.isSafeInteger(Number(user.id))) return null;
    return user;
  } catch {
    return null;
  }
}

async function initDatabase() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coin_players (
      telegram_id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
      last_mint_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS coin_ledger (
      id BIGSERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL REFERENCES coin_players(telegram_id),
      amount BIGINT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function requireUser(req, res, next) {
  const user = verifyTelegramInitData(req.get("X-Telegram-Init-Data"));
  if (!user) return res.status(401).json({ ok: false, error: "invalid_telegram_auth" });
  req.telegramUser = user;
  next();
}

app.get("/health", async (_req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, database: "not_configured" });
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "TheEnd Coin", database: "connected" });
  } catch {
    res.status(503).json({ ok: false, database: "disconnected" });
  }
});

app.get("/api/coin/me", requireUser, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "database_not_configured" });
  try {
    const u = req.telegramUser;
    const result = await pool.query(
      `INSERT INTO coin_players (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id) DO UPDATE
       SET username = EXCLUDED.username, first_name = EXCLUDED.first_name
       RETURNING balance, last_mint_at`,
      [String(u.id), u.username || null, u.first_name || null]
    );
    res.json({ ok: true, balance: Number(result.rows[0].balance), lastMintAt: result.rows[0].last_mint_at });
  } catch (error) {
    console.error("GET /api/coin/me:", error);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/api/coin/mint", requireUser, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "database_not_configured" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = req.telegramUser;
    await client.query(
      `INSERT INTO coin_players (telegram_id, username, first_name)
       VALUES ($1, $2, $3) ON CONFLICT (telegram_id) DO NOTHING`,
      [String(u.id), u.username || null, u.first_name || null]
    );
    const locked = await client.query(
      "SELECT balance, last_mint_at FROM coin_players WHERE telegram_id = $1 FOR UPDATE",
      [String(u.id)]
    );
    const player = locked.rows[0];
    if (player.last_mint_at && Date.now() - new Date(player.last_mint_at).getTime() < 1200) {
      await client.query("ROLLBACK");
      return res.status(429).json({ ok: false, error: "cooldown", balance: Number(player.balance) });
    }
    const updated = await client.query(
      `UPDATE coin_players SET balance = balance + 1, last_mint_at = NOW()
       WHERE telegram_id = $1 RETURNING balance, last_mint_at`,
      [String(u.id)]
    );
    await client.query(
      "INSERT INTO coin_ledger (telegram_id, amount, reason) VALUES ($1, 1, 'tap')",
      [String(u.id)]
    );
    await client.query("COMMIT");
    res.json({ ok: true, balance: Number(updated.rows[0].balance), lastMintAt: updated.rows[0].last_mint_at });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/coin/mint:", error);
    res.status(500).json({ ok: false, error: "server_error" });
  } finally {
    client.release();
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

initDatabase()
  .then(() => app.listen(PORT, () => console.log(`TheEnd Coin listening on ${PORT}`)))
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });

process.on("SIGTERM", async () => {
  if (pool) await pool.end();
  process.exit(0);
});