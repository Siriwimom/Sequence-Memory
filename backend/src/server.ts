/**
 * server.ts — Brain Test Platform Backend (single file)
 *
 * Stack  : Express + TypeScript + Supabase
 * Auth   : Supabase Auth (JWT)
 * DB     : Supabase PostgreSQL (RLS enabled)
 *
 * ── Setup ──────────────────────────────────────────────────
 *  1. npm install express @supabase/supabase-js cors dotenv zod
 *  2. npm install -D typescript tsx @types/express @types/cors @types/node
 *  3. cp .env.example .env  →  ใส่ค่าจาก Supabase dashboard
 *  4. รัน supabase_migration.sql ใน Supabase SQL Editor ก่อน
 *  5. npx tsx watch server.ts
 *
 * ── API ────────────────────────────────────────────────────
 *  POST  /auth/register        สมัครสมาชิก
 *  POST  /auth/login           เข้าสู่ระบบ
 *  GET   /auth/me              ดูโปรไฟล์ตัวเอง               🔒
 *
 *  POST  /sessions             สร้าง test session             🔒
 *  PATCH /sessions/:id         อัปเดตสถานะ session            🔒
 *
 *  POST  /results              บันทึก GameResult จากเกม       🔒
 *  GET   /results/me           ผลของตัวเอง                    🔒
 *  GET   /results/leaderboard  Top 50 ต่อเกม                  public
 *  GET   /results/stats        Distribution ต่อเกม            public
 *
 *  POST  /health-records       บันทึกข้อมูลสุขภาพกาย          🔒
 *  POST  /assessments          บันทึก psych assessment        🔒
 *
 *  GET   /admin/players        รายชื่อผู้เล่นทั้งหมด          🔒 instructor
 *  GET   /admin/results        ผลทั้งหมด                      🔒 instructor
 */

import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z, ZodError } from "zod";

// ════════════════════════════════════════════════════════════
// ENV
// ════════════════════════════════════════════════════════════

const PORT = process.env.PORT ?? "3001";
const CLIENT_URL = process.env.CLIENT_URL ?? "*";
const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SUPA_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPA_URL || !SUPA_ANON || !SUPA_SVC) {
  console.error("❌  Missing Supabase env vars — copy .env.example → .env");
  process.exit(1);
}

// ════════════════════════════════════════════════════════════
// SUPABASE CLIENTS
//  anonClient  — Supabase Auth (login / register)
//  svcClient   — bypass RLS สำหรับ admin routes
// ════════════════════════════════════════════════════════════

const anonClient: SupabaseClient = createClient(SUPA_URL, SUPA_ANON);
const svcClient: SupabaseClient = createClient(SUPA_URL, SUPA_SVC);

// ════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════

/** Contract เดียวกับ GameResult ที่เกมส่งมาผ่าน onGameComplete() */
interface GameResult {
  playerId: string;
  sessionId: string;
  gameName: string;
  score: number;
  accuracy?: number;
  reactionTimeMs?: number;
  responseTimesMs?: number[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  rawData: unknown;
}

declare global {
  namespace Express {
    interface Request {
      authUserId?: string;
      playerId?: string;
      playerRole?: string;
    }
  }
}

// ════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ════════════════════════════════════════════════════════════

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password ต้องมีอย่างน้อย 6 ตัวอักษร"),
  display_name: z.string().min(2).max(50),
  role: z.enum(["player", "instructor"]).default("player"),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const GameResultSchema = z.object({
  playerId: z.string().uuid(),
  sessionId: z.string().uuid(),
  gameName: z.string().min(1),
  score: z.number().int().min(0),
  accuracy: z.number().min(0).max(100).optional(),
  reactionTimeMs: z.number().int().min(0).optional(),
  responseTimesMs: z.array(z.number().int().min(0)).optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
  rawData: z.unknown().optional(),
});

const SessionSchema = z.object({
  device_info: z.record(z.unknown()).optional(),
});

const SessionPatchSchema = z.object({
  status: z.enum(["completed", "aborted"]),
});

const HealthRecordSchema = z.object({
  weight_kg: z.number().positive().optional(),
  height_cm: z.number().positive().optional(),
  blood_pressure_sys: z.number().int().optional(),
  blood_pressure_dia: z.number().int().optional(),
  heart_rate_bpm: z.number().int().optional(),
  notes: z.string().optional(),
});

const AssessmentSchema = z.object({
  assessment_type: z.string().min(1),
  score: z.number().int().optional(),
  answers: z.unknown().optional(),
  notes: z.string().optional(),
});

// ════════════════════════════════════════════════════════════
// MIDDLEWARE
// ════════════════════════════════════════════════════════════

async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing Authorization header" });
    return;
  }
  const token = header.slice(7);

  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ message: "Token expired or invalid" });
    return;
  }

  const { data: profile } = await svcClient
    .from("player_profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    res.status(403).json({ message: "Player profile not found" });
    return;
  }

  req.authUserId = user.id;
  req.playerId = profile.id as string;
  req.playerRole = profile.role as string;
  next();
}

function requireInstructor(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!["instructor", "admin"].includes(req.playerRole ?? "")) {
    res.status(403).json({ message: "Instructor access required" });
    return;
  }
  next();
}

function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation error",
      errors: err.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
    });
    return;
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
}

// ════════════════════════════════════════════════════════════
// HANDLERS — AUTH
// ════════════════════════════════════════════════════════════

async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, display_name, role } = RegisterSchema.parse(req.body);

    const { data: authData, error: authErr } = await svcClient.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authErr || !authData.user) {
      res.status(400).json({ message: authErr?.message ?? "Failed to create user" });
      return;
    }

    const { data: profile, error: profErr } = await svcClient
      .from("player_profiles")
      .insert({ auth_user_id: authData.user.id, display_name, role })
      .select("id, display_name, role")
      .single();

    if (profErr) {
      await svcClient.auth.admin.deleteUser(authData.user.id);
      res.status(500).json({ message: profErr.message });
      return;
    }

    const { data: session } = await anonClient.auth.signInWithPassword({ email, password });

    res.status(201).json({
      token: session.session?.access_token,
      profile: { id: profile.id, display_name: profile.display_name, role: profile.role, email },
    });
  } catch (err) { next(err); }
}

async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const { data: profile } = await svcClient
      .from("player_profiles")
      .select("id, display_name, role")
      .eq("auth_user_id", data.user.id)
      .single();

    res.json({ token: data.session.access_token, profile: { ...profile, email } });
  } catch (err) { next(err); }
}

async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data: profile } = await svcClient
      .from("player_profiles")
      .select("id, display_name, role, created_at")
      .eq("id", req.playerId!)
      .single();

    const { data: { user } } = await svcClient.auth.admin.getUserById(req.authUserId!);
    res.json({ ...profile, email: user?.email });
  } catch (err) { next(err); }
}

// ════════════════════════════════════════════════════════════
// HANDLERS — SESSIONS
// ════════════════════════════════════════════════════════════

async function createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { device_info } = SessionSchema.parse(req.body);
    const { data, error } = await svcClient
      .from("test_sessions")
      .insert({ player_id: req.playerId!, device_info: device_info ?? null })
      .select().single();

    if (error) { res.status(500).json({ message: error.message }); return; }
    res.status(201).json(data);
  } catch (err) { next(err); }
}

async function updateSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = SessionPatchSchema.parse(req.body);
    const { data, error } = await svcClient
      .from("test_sessions")
      .update({ status })
      .eq("id", req.params["id"])
      .eq("player_id", req.playerId!)
      .select().single();

    if (error || !data) { res.status(404).json({ message: "Session not found" }); return; }
    res.json(data);
  } catch (err) { next(err); }
}

// ════════════════════════════════════════════════════════════
// HANDLERS — GAME RESULTS
// ════════════════════════════════════════════════════════════

async function submitResult(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = GameResultSchema.parse(req.body) as GameResult;

    if (body.playerId !== req.playerId) {
      res.status(403).json({ message: "playerId does not match authenticated user" });
      return;
    }

    // แปลง gameName → game_id  e.g. "Sequence Memory Test" → "sequence-memory-test"
    const gameId = body.gameName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const { data, error } = await svcClient
      .from("game_results")
      .insert({
        session_id:       body.sessionId,
        player_id:        body.playerId,
        game_id:          gameId,
        game_name:        body.gameName,
        score:            body.score,
        accuracy:         body.accuracy         ?? null,
        reaction_time_ms: body.reactionTimeMs   ?? null,
        response_times_ms:body.responseTimesMs  ?? null,
        duration_ms:      body.durationMs,
        started_at:       body.startedAt,
        ended_at:         body.endedAt,
        raw_data:         body.rawData          ?? null,
      })
      .select().single();

    if (error) { res.status(500).json({ message: error.message }); return; }
    res.status(201).json(data);
  } catch (err) { next(err); }
}

async function getMyResults(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const gameId = req.query["gameId"] as string | undefined;
    const limit  = Math.min(Number(req.query["limit"] ?? 50), 100);

    let query = svcClient
      .from("game_results")
      .select("game_id, game_name, score, accuracy, reaction_time_ms, duration_ms, started_at, ended_at, raw_data")
      .eq("player_id", req.playerId!)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (gameId) query = query.eq("game_id", gameId);

    const { data: history, error } = await query;
    if (error) { res.status(500).json({ message: error.message }); return; }

    type Row = { game_id: string; score: number };
    const best = (history ?? []).reduce((acc: Record<string, number>, r: Row) => {
      if (!acc[r.game_id] || r.score > acc[r.game_id]) acc[r.game_id] = r.score;
      return acc;
    }, {});

    res.json({ best, history });
  } catch (err) { next(err); }
}

async function getLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const gameId = req.query["gameId"] as string | undefined;
    const limit  = Math.min(Number(req.query["limit"] ?? 50), 100);

    let query = svcClient
      .from("leaderboard")
      .select("game_id, game_name, username, best_score, total_plays, avg_score")
      .order("best_score", { ascending: false })
      .limit(limit);

    if (gameId) query = query.eq("game_id", gameId);

    const { data, error } = await query;
    if (error) { res.status(500).json({ message: error.message }); return; }

    res.json((data ?? []).map((e, i) => ({ rank: i + 1, ...e })));
  } catch (err) { next(err); }
}

async function getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const gameId = req.query["gameId"] as string | undefined;

    let distQuery = svcClient
      .from("score_distribution")
      .select("game_id, score, count")
      .order("score", { ascending: true });
    if (gameId) distQuery = distQuery.eq("game_id", gameId);

    const { data: distribution, error } = await distQuery;
    if (error) { res.status(500).json({ message: error.message }); return; }

    let sumQuery = svcClient.from("game_results").select("game_id, score");
    if (gameId) sumQuery = sumQuery.eq("game_id", gameId);
    const { data: rows } = await sumQuery;

    type SM = Record<string, { total: number; sum: number; max: number }>;
    const map: SM = {};
    for (const r of rows ?? []) {
      const g = r.game_id as string;
      if (!map[g]) map[g] = { total: 0, sum: 0, max: 0 };
      map[g].total++;
      map[g].sum += r.score;
      if (r.score > map[g].max) map[g].max = r.score;
    }

    const stats = Object.entries(map).map(([gid, s]) => ({
      gameId:       gid,
      totalGames:   s.total,
      averageScore: Math.round((s.sum / s.total) * 10) / 10,
      maxScore:     s.max,
      distribution: (distribution ?? []).filter((d: { game_id: string }) => d.game_id === gid),
    }));

    res.json(gameId ? (stats[0] ?? null) : stats);
  } catch (err) { next(err); }
}

// ════════════════════════════════════════════════════════════
// HANDLERS — HEALTH & PSYCH
// ════════════════════════════════════════════════════════════

async function addHealthRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = HealthRecordSchema.parse(req.body);
    const { data, error } = await svcClient
      .from("physical_health_records")
      .insert({ player_id: req.playerId!, ...body })
      .select().single();

    if (error) { res.status(500).json({ message: error.message }); return; }
    res.status(201).json(data);
  } catch (err) { next(err); }
}

async function addAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = AssessmentSchema.parse(req.body);
    const { data, error } = await svcClient
      .from("psychological_assessments")
      .insert({ player_id: req.playerId!, ...body })
      .select().single();

    if (error) { res.status(500).json({ message: error.message }); return; }
    res.status(201).json(data);
  } catch (err) { next(err); }
}

// ════════════════════════════════════════════════════════════
// HANDLERS — ADMIN
// ════════════════════════════════════════════════════════════

async function getAllPlayers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, error } = await svcClient
      .from("player_profiles")
      .select("id, display_name, role, created_at")
      .eq("role", "player")
      .order("created_at", { ascending: false });

    if (error) { res.status(500).json({ message: error.message }); return; }
    res.json(data);
  } catch (err) { next(err); }
}

async function getAllResults(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { playerId, gameId } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query["limit"] ?? 100), 500);

    let query = svcClient
      .from("game_results")
      .select(`id, game_id, game_name, score, accuracy,
               reaction_time_ms, duration_ms, started_at, ended_at, raw_data,
               player_profiles ( display_name )`)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (playerId) query = query.eq("player_id", playerId);
    if (gameId)   query = query.eq("game_id",   gameId);

    const { data, error } = await query;
    if (error) { res.status(500).json({ message: error.message }); return; }
    res.json(data);
  } catch (err) { next(err); }
}

// ════════════════════════════════════════════════════════════
// APP
// ════════════════════════════════════════════════════════════

const app = express();

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// Auth
app.post("/auth/register", register);
app.post("/auth/login",    login);
app.get ("/auth/me",       authenticate, getMe);

// Sessions
app.post ("/sessions",     authenticate, createSession);
app.patch("/sessions/:id", authenticate, updateSession);

// Game results
app.post("/results",              authenticate, submitResult);
app.get ("/results/me",           authenticate, getMyResults);
app.get ("/results/leaderboard",               getLeaderboard);  // public
app.get ("/results/stats",                     getStats);        // public

// Health & psych
app.post("/health-records", authenticate, addHealthRecord);
app.post("/assessments",    authenticate, addAssessment);

// Admin
app.get("/admin/players", authenticate, requireInstructor, getAllPlayers);
app.get("/admin/results", authenticate, requireInstructor, getAllResults);

// Error handler (ต้องอยู่ท้ายสุดเสมอ)
app.use(errorHandler);

app.listen(Number(PORT), () =>
  console.log(`🚀  Server → http://localhost:${PORT}`)
);