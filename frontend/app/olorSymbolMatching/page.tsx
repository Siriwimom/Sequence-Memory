// @ts-nocheck
"use client"

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

const GAME_CONFIG = {
  maxLevel: Infinity,
  fairSeed: 20260514,
  memorizeTimeMs: 15000,
  nextLevelDelayMs: 750,
  correctPreviewMs: 180,
  wrongPreviewMs: 500,
}

// ─── All unique shapes ─────────────────────────────────────────────────────────

const ALL_SHAPES = [
  "circle", "square", "triangle", "diamond", "hexagon", "star", "pentagon",
  "cross", "oval", "rectangle", "roundedSquare", "octagon", "trapezoid",
  "parallelogram", "leftTriangle", "rightTriangle", "ring", "xShape", "kite",
  "hourglass", "semicircle", "pill", "thinDiamond", "wideHexagon",
]

function polygonClipPath(sides, rotationDeg) {
  const points = Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + (rotationDeg * Math.PI) / 180
    const x = 50 + 45 * Math.cos(angle)
    const y = 50 + 45 * Math.sin(angle)
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`
  })
  return `polygon(${points.join(", ")})`
}

// ─── Shape colors: each shape gets a consistent vivid color ──────────────────

const SHAPE_COLOR_POOL = [
  "#e74c3c", "#e67e22", "#f39c12", "#27ae60", "#16a085",
  "#2980b9", "#8e44ad", "#c0392b", "#d35400", "#2ecc71",
  "#1abc9c", "#3498db", "#9b59b6", "#e91e63", "#00bcd4",
  "#ff5722", "#4caf50", "#673ab7", "#009688", "#ff9800",
  "#795548", "#607d8b", "#f44336", "#2196f3",
]

function getShapeColor(idx) {
  return SHAPE_COLOR_POOL[idx % SHAPE_COLOR_POOL.length]
}

// Shuffle shapes for a level using a seeded RNG so each level gets different shape ordering.
// seed already encodes the run (from createRunSeed) so every new game gets a fresh shuffle.
function getShapesForLevel(level, seed) {
  // XOR seed with level-specific prime so each level within the same run also differs
  const rand = seededRandom((seed ^ (level * 3571)) >>> 0)
  const pool = [...ALL_SHAPES]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return (idx) => {
    if (idx < pool.length) return pool[idx]
    const sides = 3 + (idx % 10)
    const rotation = Math.floor(idx / 10) * 9
    return `polygon-${sides}-${rotation}`
  }
}

function ShapeIcon({ shape, color }) {
  const c = color || "#111827"
  const common = {
    width: 44,
    height: 44,
    background: c,
    flexShrink: 0,
  }

  if (shape.startsWith("polygon-")) {
    const [, sidesText, rotText] = shape.split("-")
    return <div style={{ ...common, clipPath: polygonClipPath(Number(sidesText) || 3, Number(rotText) || 0) }} />
  }

  if (shape === "circle") return <div style={{ ...common, borderRadius: "50%" }} />
  if (shape === "square") return <div style={{ ...common, borderRadius: 5 }} />
  if (shape === "oval") return <div style={{ ...common, width: 58, height: 38, borderRadius: "50%" }} />
  if (shape === "rectangle") return <div style={{ ...common, width: 62, height: 36, borderRadius: 7 }} />
  if (shape === "roundedSquare") return <div style={{ ...common, borderRadius: 16 }} />
  if (shape === "pill") return <div style={{ ...common, width: 66, height: 36, borderRadius: 999 }} />
  if (shape === "ring") {
    return <div style={{ ...common, borderRadius: "50%", background: "transparent", border: `10px solid ${c}`, boxSizing: "border-box" }} />
  }
  if (shape === "triangle") {
    return <div style={{ width: 0, height: 0, borderLeft: "26px solid transparent", borderRight: "26px solid transparent", borderBottom: `50px solid ${c}`, filter: "none" }} />
  }
  if (shape === "diamond") return <div style={{ ...common, width: 42, height: 42, borderRadius: 9, transform: "rotate(45deg)" }} />
  if (shape === "hexagon") return <div style={{ ...common, clipPath: "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%)" }} />
  if (shape === "wideHexagon") return <div style={{ ...common, width: 60, height: 42, clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)" }} />
  if (shape === "octagon") return <div style={{ ...common, clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }} />
  if (shape === "pentagon") return <div style={{ ...common, clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }} />
  if (shape === "trapezoid") return <div style={{ ...common, width: 58, height: 42, clipPath: "polygon(22% 0%, 78% 0%, 100% 100%, 0% 100%)" }} />
  if (shape === "parallelogram") return <div style={{ ...common, width: 58, height: 42, clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)" }} />
  if (shape === "leftTriangle") return <div style={{ ...common, clipPath: "polygon(0% 50%, 100% 0%, 100% 100%)" }} />
  if (shape === "rightTriangle") return <div style={{ ...common, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%)" }} />
  if (shape === "cross") return <div style={{ ...common, clipPath: "polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%)" }} />
  if (shape === "xShape") return <div style={{ ...common, clipPath: "polygon(18% 0%, 50% 32%, 82% 0%, 100% 18%, 68% 50%, 100% 82%, 82% 100%, 50% 68%, 18% 100%, 0% 82%, 32% 50%, 0% 18%)" }} />
  if (shape === "kite") return <div style={{ ...common, width: 40, height: 56, clipPath: "polygon(50% 0%, 92% 38%, 50% 100%, 8% 38%)" }} />
  if (shape === "thinDiamond") return <div style={{ ...common, width: 32, height: 60, clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
  if (shape === "hourglass") return <div style={{ ...common, clipPath: "polygon(0% 0%, 100% 0%, 58% 50%, 100% 100%, 0% 100%, 42% 50%)" }} />
  if (shape === "semicircle") return <div style={{ ...common, width: 56, height: 30, borderRadius: "56px 56px 0 0" }} />
  if (shape === "star") return <div style={{ ...common, clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" }} />
  return <div style={{ ...common, borderRadius: 5 }} />
}

// ─── Seeded RNG & helpers ─────────────────────────────────────────────────────

function seededRandom(seed) {
  let v = seed || 1
  return () => {
    v = (v * 1664525 + 1013904223) % 4294967296
    return v / 4294967296
  }
}

function shuffleWithRandom(items, rand) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function hashString(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

function createRunSeed(playerId, sessionId) {
  const r = typeof crypto !== "undefined" && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : Math.floor(Math.random() * 1e9)
  return hashString(`${GAME_CONFIG.fairSeed}:${playerId}:${sessionId}:${Date.now()}:${performance.now()}:${r}`)
}

// ─── Grid helpers ─────────────────────────────────────────────────────────────

function getPairsForLevel(level) { return level }

function getGridCols(totalCards) {
  if (totalCards <= 2) return 2
  if (totalCards <= 4) return 2
  if (totalCards <= 6) return 3
  if (totalCards <= 12) return 4
  if (totalCards <= 20) return 5
  if (totalCards <= 30) return 6
  return 7
}

function areTouching(a, b, cols) {
  const rA = Math.floor(a / cols), cA = a % cols
  const rB = Math.floor(b / cols), cB = b % cols
  return Math.abs(rA - rB) <= 1 && Math.abs(cA - cB) <= 1
}

function scoreLayout(cards, cols) {
  const pos = new Map()
  cards.forEach((card, i) => {
    const arr = pos.get(card.pairId) ?? []
    arr.push(i)
    pos.set(card.pairId, arr)
  })
  let score = 0
  pos.forEach(([a, b]) => {
    if (a == null || b == null) return
    if (areTouching(a, b, cols)) score -= 1000
    score += Math.abs(a - b)
  })
  return score
}

function getFairTarget(cards, level) {
  const cols = getGridCols(cards.length)
  const scores = []
  for (let i = 0; i < 120; i++) {
    const rand = seededRandom(GAME_CONFIG.fairSeed + level * 1009 + i * 7919)
    scores.push(scoreLayout(shuffleWithRandom(cards, rand), cols))
  }
  scores.sort((a, b) => a - b)
  return scores[Math.floor(scores.length * 0.65)] ?? 0
}

function fairShuffle(cards, level, seed) {
  const cols = getGridCols(cards.length)
  const target = getFairTarget(cards, level)
  let best = cards, bestGap = Infinity, bestScore = -Infinity
  for (let i = 0; i < 160; i++) {
    const rand = seededRandom(seed + level * 1009 + i * 9176)
    const candidate = shuffleWithRandom(cards, rand)
    const score = scoreLayout(candidate, cols)
    const gap = Math.abs(score - target)
    if (gap < bestGap || (gap === bestGap && score > bestScore)) {
      best = candidate; bestGap = gap; bestScore = score
    }
  }
  return best
}

function buildCards(level, seed = GAME_CONFIG.fairSeed) {
  const pairs = getPairsForLevel(level)
  const getShape = getShapesForLevel(level, seed)
  const cards = []
  for (let i = 0; i < pairs; i++) {
    const shape = getShape(i)
    const color = getShapeColor(i)
    const pairId = `pair-${level}-${i}-${shape}`
    cards.push({ id: `${pairId}-a`, pairId, shape, color, isMatched: false })
    cards.push({ id: `${pairId}-b`, pairId, shape, color, isMatched: false })
  }
  return fairShuffle(cards, level, seed)
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initial = {
  phase: "idle",
  level: 0,
  seed: GAME_CONFIG.fairSeed,
  cards: [],
  selectedIds: [],
  correctPairsInLevel: 0,
  wrongAttemptsInLevel: 0,
  levelHistory: [],
}

function reducer(state, action) {
  switch (action.type) {
    case "START": {
      const level = 1
      return { ...initial, phase: "memorize", level, seed: action.seed, cards: buildCards(level, action.seed) }
    }
    case "BEGIN_PLAY":
      return { ...state, phase: "playing", selectedIds: [] }
    case "SELECT_CARD":
      if (state.selectedIds.includes(action.cardId) || state.selectedIds.length >= 2) return state
      return { ...state, selectedIds: [...state.selectedIds, action.cardId] }
    case "MATCH_PAIR":
      return {
        ...state,
        cards: state.cards.map(c => c.id === action.firstId || c.id === action.secondId ? { ...c, isMatched: true } : c),
        selectedIds: [],
        correctPairsInLevel: state.correctPairsInLevel + 1,
      }
    case "NEXT_LEVEL": {
      const next = state.level + 1
      return {
        ...state,
        phase: "memorize",
        level: next,
        cards: buildCards(next, state.seed),
        selectedIds: [],
        correctPairsInLevel: 0,
        wrongAttemptsInLevel: 0,
        levelHistory: [...state.levelHistory, action.record],
      }
    }
    case "FAIL":
      return { ...state, phase: "result", selectedIds: [], wrongAttemptsInLevel: state.wrongAttemptsInLevel + 1, levelHistory: [...state.levelHistory, action.record] }
    case "RESET":
      return initial
    default:
      return state
  }
}

// ─── Result builder ───────────────────────────────────────────────────────────

function buildGameResult({ playerId, sessionId, startedAt, endedAt, startIso, levelHistory, reactionTimesMs, fairSeed }) {
  const completed = levelHistory.filter(l => l.completed).length
  const totalCorrect = levelHistory.reduce((s, l) => s + l.correctPairs, 0)
  const totalWrong = levelHistory.reduce((s, l) => s + l.wrongAttempts, 0)
  const totalAttempts = totalCorrect + totalWrong
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0
  const failedLevel = levelHistory[levelHistory.length - 1]?.level ?? 0
  return {
    gameId: "symbol-matching",
    playerId, sessionId,
    gameName: "Symbol Matching Test",
    score: completed * 100 + totalCorrect * 10,
    accuracy, reactionTimesMs,
    startedAt: startIso,
    endedAt: new Date().toISOString(),
    durationMs: Math.round(endedAt - startedAt),
    rawData: { finalLevel: completed, failedLevel, totalCorrectPairs: totalCorrect, totalWrongAttempts: totalWrong, totalAttempts, memorizeTimeMs: GAME_CONFIG.memorizeTimeMs, fairSeed, levelHistory },
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PALETTE = {
  bg: "linear-gradient(145deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
  card: "rgba(255,255,255,0.06)",
  cardBorder: "rgba(255,255,255,0.12)",
  cardSelected: "rgba(255,220,80,0.22)",
  cardSelectedBorder: "#ffd84a",
  cardMatched: "rgba(255,255,255,0.03)",
  accent: "#ffd84a",
  accentText: "#1a1540",
  text: "#f0eeff",
  muted: "rgba(240,238,255,0.55)",
  btnPrimary: "linear-gradient(135deg, #ffd84a, #ffb300)",
  btnSecondary: "rgba(255,255,255,0.08)",
}

const FONT = "'Nunito', 'Segoe UI', sans-serif"

// ─── Component ────────────────────────────────────────────────────────────────

export default function SymbolMatching({
  playerId = "test-player",
  sessionId = "test-session",
  onGameComplete = () => {},
}) {
  const [state, dispatch] = useReducer(reducer, initial)
  const [timeLeftMs, setTimeLeftMs] = useState(GAME_CONFIG.memorizeTimeMs)
  const [locked, setLocked] = useState(false)
  const [flash, setFlash] = useState(null) // "correct" | "wrong"

  const startPerfRef = useRef(0)
  const startIsoRef = useRef("")
  const levelStartRef = useRef(0)
  const lastActionRef = useRef(0)
  const reactionTimesRef = useRef([])
  const completedRef = useRef(false)

  const pairsInLevel = state.level > 0 ? getPairsForLevel(state.level) : 0

  const matchedPairsInLevel = useMemo(() => {
    const ids = new Set(state.cards.filter(c => c.isMatched).map(c => c.pairId))
    return ids.size
  }, [state.cards])

  const selectedCards = useMemo(
    () => state.selectedIds.map(id => state.cards.find(c => c.id === id)).filter(Boolean),
    [state.selectedIds, state.cards]
  )

  const createLevelRecord = useCallback((completed, wrongAdd = 0) => ({
    level: state.level,
    pairs: pairsInLevel,
    totalCards: state.cards.length,
    completed,
    correctPairs: matchedPairsInLevel,
    wrongAttempts: state.wrongAttemptsInLevel + wrongAdd,
    durationMs: Math.round(performance.now() - levelStartRef.current),
  }), [state.level, pairsInLevel, state.cards.length, matchedPairsInLevel, state.wrongAttemptsInLevel])

  const completeGame = useCallback((history) => {
    const result = buildGameResult({
      playerId, sessionId,
      startedAt: startPerfRef.current,
      endedAt: performance.now(),
      startIso: startIsoRef.current,
      levelHistory: history,
      reactionTimesMs: reactionTimesRef.current,
      fairSeed: state.seed,
    })
    onGameComplete(result)
  }, [playerId, sessionId, onGameComplete, state.seed])

  const handleStart = () => {
    startPerfRef.current = performance.now()
    startIsoRef.current = new Date().toISOString()
    levelStartRef.current = performance.now()
    lastActionRef.current = performance.now()
    reactionTimesRef.current = []
    completedRef.current = false
    setLocked(false)
    setFlash(null)
    setTimeLeftMs(GAME_CONFIG.memorizeTimeMs)
    dispatch({ type: "START", seed: createRunSeed(playerId, sessionId) })
  }

  // Memorize phase timer
  useEffect(() => {
    if (state.phase !== "memorize") return
    levelStartRef.current = performance.now()
    completedRef.current = false
    setLocked(true)
    setTimeLeftMs(GAME_CONFIG.memorizeTimeMs)

    const interval = window.setInterval(() => {
      const elapsed = performance.now() - levelStartRef.current
      setTimeLeftMs(Math.max(GAME_CONFIG.memorizeTimeMs - elapsed, 0))
    }, 100)

    const timer = window.setTimeout(() => {
      setLocked(false)
      lastActionRef.current = performance.now()
      dispatch({ type: "BEGIN_PLAY" })
    }, GAME_CONFIG.memorizeTimeMs)

    return () => { window.clearInterval(interval); window.clearTimeout(timer) }
  }, [state.phase, state.level])

  // Pair check
  useEffect(() => {
    if (selectedCards.length !== 2) return
    setLocked(true)
    const [first, second] = selectedCards
    const isMatch = first.pairId === second.pairId

    if (isMatch) {
      setFlash("correct")
      window.setTimeout(() => {
        dispatch({ type: "MATCH_PAIR", firstId: first.id, secondId: second.id })
        setFlash(null)
        setLocked(false)
      }, GAME_CONFIG.correctPreviewMs)
      return
    }

    setFlash("wrong")
    const record = createLevelRecord(false, 1)
    const history = [...state.levelHistory, record]
    window.setTimeout(() => {
      dispatch({ type: "FAIL", record })
      setFlash(null)
      setLocked(false)
      completeGame(history)
    }, GAME_CONFIG.wrongPreviewMs)
  }, [selectedCards, createLevelRecord, state.levelHistory, completeGame])

  // Level complete
  useEffect(() => {
    if (state.phase !== "playing") return
    if (matchedPairsInLevel !== pairsInLevel || pairsInLevel === 0) return
    if (completedRef.current) return
    completedRef.current = true
    const record = createLevelRecord(true)
    window.setTimeout(() => {
      dispatch({ type: "NEXT_LEVEL", record })
    }, GAME_CONFIG.nextLevelDelayMs)
  }, [matchedPairsInLevel, pairsInLevel, state.phase, createLevelRecord])

  const handleCardClick = (card) => {
    if (state.phase !== "playing" || locked || card.isMatched) return
    if (state.selectedIds.includes(card.id)) return
    const now = performance.now()
    reactionTimesRef.current.push(Math.round(now - lastActionRef.current))
    lastActionRef.current = now
    dispatch({ type: "SELECT_CARD", cardId: card.id })
  }

  // ── Derived display vars ────────────────────────────────────────────────────

  const timerPct = (timeLeftMs / GAME_CONFIG.memorizeTimeMs) * 100
  const seconds = Math.ceil(timeLeftMs / 1000)
  const isPlaying = state.phase === "playing"
  const isMemorize = state.phase === "memorize"

  const totalCards = state.cards.length
  const gridCols = getGridCols(totalCards)
  const gridGap = totalCards <= 12 ? 12 : totalCards <= 24 ? 9 : 7
  const cardSize = `min(110px, calc((90vw - ${(gridCols - 1) * gridGap}px) / ${gridCols}), calc((56vh - ${(Math.ceil(totalCards / gridCols) - 1) * gridGap}px) / ${Math.ceil(totalCards / gridCols)}))`

  // ── Screens ─────────────────────────────────────────────────────────────────

  const wrapStyle = {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: PALETTE.bg,
    fontFamily: FONT,
    color: PALETTE.text,
    paddingTop: "1rem",
    paddingRight: "1rem",
    paddingBottom: "1rem",
    paddingLeft: "1rem",
    gap: "1.5rem",
    position: "relative",
    overflow: "hidden",
  }

  // Decorative background blobs
  const BgBlobs = () => (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "rgba(120,80,255,0.12)", top: -100, left: -100, filter: "blur(60px)" }} />
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "rgba(255,180,50,0.09)", bottom: -80, right: -60, filter: "blur(50px)" }} />
      <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", background: "rgba(80,200,255,0.07)", top: "40%", right: "10%", filter: "blur(40px)" }} />
    </div>
  )

  if (state.phase === "idle") {
    return (
      <div style={wrapStyle}>
        <BgBlobs />
        <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem", textAlign: "center" }}>
          {/* Logo / icon cluster */}
          <div style={{ display: "flex", gap: 14, marginBottom: 4 }}>
            {["circle", "hexagon", "star", "diamond"].map((s, i) => (
              <div key={s} style={{ opacity: 0.85 }}>
                <ShapeIcon shape={s} color={SHAPE_COLOR_POOL[i * 3]} />
              </div>
            ))}
          </div>

          <h1 style={{ fontSize: "clamp(26px, 6vw, 42px)", fontWeight: 900, margin: 0, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
            Symbol Matching
          </h1>
          <p style={{ color: PALETTE.muted, fontSize: 16, margin: 0, maxWidth: 320, lineHeight: 1.6 }}>
            จำตำแหน่งของรูปทรงเรขาคณิต แล้วจับคู่ให้ถูกต้อง
          </p>

          {/* Fairness explanation */}
          <div style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: "14px 20px",
            maxWidth: 340,
            fontSize: 13,
            color: PALETTE.muted,
            lineHeight: 1.65,
            textAlign: "left",
          }}>
            <span style={{ color: PALETTE.accent, fontWeight: 700 }}>ระบบความยุติธรรม (Fair Layout)</span><br />
            การ์ดทุกใบถูกจัดวางด้วยอัลกอริทึม Fair Shuffle ที่รับประกันว่า<br />
            • คู่ที่เหมือนกัน <strong>จะไม่อยู่ติดกัน</strong><br />
            • ระยะห่างเฉลี่ยระหว่างคู่ <strong>เท่าๆ กันทุกเกม</strong><br />
            • รูปทรงสุ่มใหม่ <strong>ทุกด่าน</strong> ด้วย seed เฉพาะ
          </div>

          <button
            onClick={handleStart}
            style={{
              background: PALETTE.btnPrimary,
              color: PALETTE.accentText,
              border: "none",
              borderRadius: 50,
              padding: "14px 48px",
              fontSize: 18,
              fontWeight: 900,
              cursor: "pointer",
              fontFamily: FONT,
              letterSpacing: "0.3px",
              boxShadow: "0 8px 32px rgba(255,216,74,0.3)",
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            onMouseEnter={e => { e.target.style.transform = "scale(1.04)"; e.target.style.boxShadow = "0 12px 40px rgba(255,216,74,0.4)" }}
            onMouseLeave={e => { e.target.style.transform = "scale(1)"; e.target.style.boxShadow = "0 8px 32px rgba(255,216,74,0.3)" }}
          >
            เริ่มเล่น
          </button>
        </div>
      </div>
    )
  }

  if (state.phase === "result") {
    const completed = state.levelHistory.filter(l => l.completed).length
    const last = state.levelHistory[state.levelHistory.length - 1]
    const correctPairs = state.levelHistory.reduce((s, l) => s + l.correctPairs, 0)
    const totalWrong = state.levelHistory.reduce((s, l) => s + l.wrongAttempts, 0)
    const totalAttempts = correctPairs + totalWrong
    const accuracy = totalAttempts > 0 ? Math.round((correctPairs / totalAttempts) * 100) : 0
    const score = completed * 100 + correctPairs * 10

    return (
      <div style={wrapStyle}>
        <BgBlobs />
        <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem", textAlign: "center", width: "100%", maxWidth: 380 }}>
          <div style={{ fontSize: 14, color: PALETTE.muted, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>ผลการเล่น</div>

          <div style={{ fontSize: "clamp(72px, 20vw, 100px)", fontWeight: 900, lineHeight: 1, color: PALETTE.accent, textShadow: "0 0 40px rgba(255,216,74,0.4)" }}>
            {completed}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: -8, color: PALETTE.muted }}>ด่านที่ผ่าน</div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, width: "100%" }}>
            {[
              { label: "คะแนน", value: score },
              { label: "ความแม่น", value: `${accuracy}%` },
              { label: "ด่านที่หยุด", value: last?.level ?? "-" },
            ].map(stat => (
              <div key={stat.label} style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "12px 8px",
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: PALETTE.text }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: PALETTE.muted, marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            <button
              onClick={handleStart}
              style={{ background: PALETTE.btnPrimary, color: PALETTE.accentText, border: "none", borderRadius: 50, padding: "13px 0", fontSize: 17, fontWeight: 900, cursor: "pointer", fontFamily: FONT, width: "100%" }}
            >
              เล่นอีกครั้ง
            </button>
            <button
              onClick={() => dispatch({ type: "RESET" })}
              style={{ background: "rgba(255,255,255,0.07)", color: PALETTE.text, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 50, padding: "13px 0", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: FONT, width: "100%" }}
            >
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Game screen ─────────────────────────────────────────────────────────────

  const hidden = isPlaying

  // Flash overlay color
  const flashBg = flash === "correct"
    ? "rgba(80,220,120,0.18)"
    : flash === "wrong"
    ? "rgba(255,80,80,0.18)"
    : "transparent"

  return (
    <div style={{ ...wrapStyle, gap: "0.6rem", justifyContent: "flex-start", paddingTop: "1.2rem" }}>
      <BgBlobs />

      {/* Flash overlay */}
      <div style={{
        position: "absolute", inset: 0, background: flashBg,
        transition: "background 0.1s", pointerEvents: "none", zIndex: 10,
      }} />

      {/* ── Header (fixed height so it never shifts) ── */}
      <div style={{
        zIndex: 1,
        width: "min(92vw, 760px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        minHeight: 72, // reserve space always
      }}>
        {/* Level badge */}
        <div style={{
          background: "rgba(255,216,74,0.13)",
          border: "1px solid rgba(255,216,74,0.3)",
          borderRadius: 10,
          padding: "6px 16px",
          textAlign: "center",
          minWidth: 80,
        }}>
          <div style={{ fontSize: 11, color: PALETTE.muted, letterSpacing: 1.5, textTransform: "uppercase" }}>Level</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: PALETTE.accent, lineHeight: 1.1 }}>{state.level}</div>
        </div>

        {/* Center: progress + timer bar */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Pairs progress */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14, color: PALETTE.muted }}>คู่</span>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: pairsInLevel }, (_, i) => (
                <div key={i} style={{
                  width: Math.max(8, Math.min(18, 160 / pairsInLevel)),
                  height: 8,
                  borderRadius: 4,
                  background: i < matchedPairsInLevel ? "#4ade80" : "rgba(255,255,255,0.15)",
                  transition: "background 0.2s",
                }} />
              ))}
            </div>
            <span style={{ fontSize: 14, color: PALETTE.muted }}>{matchedPairsInLevel}/{pairsInLevel}</span>
          </div>

          {/* Timer bar — always same height regardless of phase */}
          <div style={{ height: 28, display: "flex", alignItems: "center" }}>
            {isMemorize ? (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: PALETTE.muted }}>จำให้ได้!</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: timerPct < 33 ? "#f87171" : PALETTE.accent }}>
                    {seconds}s
                  </span>
                </div>
                <div style={{ width: "100%", height: 7, background: "rgba(255,255,255,0.12)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{
                    width: `${timerPct}%`,
                    height: "100%",
                    background: timerPct < 33 ? "linear-gradient(90deg,#f87171,#ef4444)" : "linear-gradient(90deg,#ffd84a,#ffb300)",
                    borderRadius: 999,
                    transition: "width 0.1s linear, background 0.5s",
                  }} />
                </div>
              </div>
            ) : (
              // Spacer when playing — same height as timer so header doesn't shift
              <div style={{ width: "100%", height: 28 }} />
            )}
          </div>
        </div>

        {/* Phase badge */}
        <div style={{
          background: isMemorize ? "rgba(255,216,74,0.1)" : "rgba(80,220,120,0.1)",
          border: `1px solid ${isMemorize ? "rgba(255,216,74,0.25)" : "rgba(80,220,120,0.25)"}`,
          borderRadius: 10,
          padding: "6px 12px",
          textAlign: "center",
          minWidth: 72,
        }}>
          <div style={{ fontSize: 11, color: PALETTE.muted, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>
            {isMemorize ? "จำ" : "เล่น"}
          </div>
          <div style={{ fontSize: 20, lineHeight: 1 }}>
            {isMemorize ? "👁" : "🎯"}
          </div>
        </div>
      </div>

      {/* Instruction line — fixed height */}
      <div style={{ zIndex: 1, minHeight: 20, fontSize: 13, color: PALETTE.muted, textAlign: "center" }}>
        {isMemorize
          ? "จำตำแหน่งรูปทรงทั้งหมดให้ได้ภายใน 15 วินาที"
          : "จับคู่รูปทรงให้ครบ — กดผิดเกมจบทันที!"}
      </div>

      {/* ── Card Grid ── */}
      <div
        style={{
          zIndex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${gridCols}, ${cardSize})`,
          gap: gridGap,
          justifyContent: "center",
          alignItems: "center",
          width: "min(92vw, 780px)",
        }}
      >
        {state.cards.map((card) => {
          const selected = state.selectedIds.includes(card.id)
          const shouldHide = hidden && !selected && !card.isMatched

          return (
            <button
              key={card.id}
              type="button"
              aria-label={`card ${card.id}`}
              onClick={() => handleCardClick(card)}
              disabled={state.phase !== "playing" || locked || card.isMatched}
              style={{
                width: cardSize,
                height: cardSize,
                minHeight: 0,
                borderRadius: 14,
                border: selected
                  ? `3px solid ${PALETTE.cardSelectedBorder}`
                  : card.isMatched
                  ? "2px solid rgba(80,220,120,0.3)"
                  : "1.5px solid rgba(255,255,255,0.13)",
                background: card.isMatched
                  ? "rgba(80,220,120,0.08)"
                  : selected
                  ? PALETTE.cardSelected
                  : PALETTE.card,
                backdropFilter: "blur(8px)",
                boxShadow: selected
                  ? `0 0 0 3px rgba(255,216,74,0.2), 0 8px 24px rgba(0,0,0,0.4)`
                  : "0 4px 12px rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: state.phase !== "playing" || locked || card.isMatched ? "default" : "pointer",
                opacity: card.isMatched ? 0.3 : 1,
                transform: selected ? "scale(1.06)" : "scale(1)",
                transition: "all 0.13s ease",
              }}
            >
              {!shouldHide && <ShapeIcon shape={card.shape} color={card.color} />}
            </button>
          )
        })}
      </div>

      <div style={{ zIndex: 1, height: 16 }} />
    </div>
  )
}