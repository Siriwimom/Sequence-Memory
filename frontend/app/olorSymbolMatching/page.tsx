"use client"

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"

type GamePhase = "idle" | "memorize" | "playing" | "result"
type ShapeType = string

type CardItem = {
  id: string
  pairId: string
  shape: ShapeType
  isMatched: boolean
}

type LevelRecord = {
  level: number
  pairs: number
  totalCards: number
  completed: boolean
  correctPairs: number
  wrongAttempts: number
  durationMs: number
}

interface GameResult {
  gameId: string
  playerId: string
  sessionId: string
  gameName: string
  score: number
  accuracy: number
  reactionTimesMs: number[]
  startedAt: string
  endedAt: string
  durationMs: number
  rawData: {
    finalLevel: number
    failedLevel: number
    totalCorrectPairs: number
    totalWrongAttempts: number
    totalAttempts: number
    memorizeTimeMs: number
    fairSeed: number
    levelHistory: LevelRecord[]
  }
}

interface GameProps {
  playerId?: string
  sessionId?: string
  onGameComplete?: (result: GameResult) => void
}

interface GameState {
  phase: GamePhase
  level: number
  seed: number
  cards: CardItem[]
  selectedIds: string[]
  correctPairsInLevel: number
  wrongAttemptsInLevel: number
  levelHistory: LevelRecord[]
}

type Action =
  | { type: "START"; seed: number }
  | { type: "BEGIN_PLAY" }
  | { type: "SELECT_CARD"; cardId: string }
  | { type: "MATCH_PAIR"; firstId: string; secondId: string }
  | { type: "NEXT_LEVEL"; record: LevelRecord }
  | { type: "FAIL"; record: LevelRecord }
  | { type: "RESET" }

const SHAPES: ShapeType[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "hexagon",
  "star",
  "pentagon",
  "cross",
  "oval",
  "rectangle",
  "roundedSquare",
  "octagon",
  "trapezoid",
  "parallelogram",
  "leftTriangle",
  "rightTriangle",
  "ring",
  "xShape",
  "kite",
  "hourglass",
  "semicircle",
  "pill",
  "thinDiamond",
  "wideHexagon",
]

function getShapeForPairIndex(index: number): ShapeType {
  if (index < SHAPES.length) return SHAPES[index]

  const sides = 3 + (index % 10)
  const rotation = Math.floor(index / 10) * 9
  return `polygon-${sides}-${rotation}`
}

function polygonClipPath(sides: number, rotationDeg: number): string {
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = ((index / sides) * Math.PI * 2) - Math.PI / 2 + (rotationDeg * Math.PI) / 180
    const x = 50 + 45 * Math.cos(angle)
    const y = 50 + 45 * Math.sin(angle)
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`
  })

  return `polygon(${points.join(", ")})`
}

const GAME_CONFIG = {
  maxLevel: Number.POSITIVE_INFINITY,
  fairSeed: 20260514,
  memorizeTimeMs: 15000,
  nextLevelDelayMs: 750,
  correctPreviewMs: 180,
  wrongPreviewMs: 500,
}

const FONT = "'DM Sans','Segoe UI',sans-serif"

const initial: GameState = {
  phase: "idle",
  level: 0,
  seed: GAME_CONFIG.fairSeed,
  cards: [],
  selectedIds: [],
  correctPairsInLevel: 0,
  wrongAttemptsInLevel: 0,
  levelHistory: [],
}

function getPairsForLevel(level: number): number {
  return level
}

function hashString(text: string): number {
  let hash = 2166136261

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash >>> 0)
}

function createRunSeed(playerId: string, sessionId: string): number {
  const randomPart =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 1_000_000_000)

  return hashString(`${GAME_CONFIG.fairSeed}:${playerId}:${sessionId}:${Date.now()}:${performance.now()}:${randomPart}`)
}

function seededRandom(seed: number): () => number {
  let value = seed || 1

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

function shuffleWithRandom<T>(items: T[], rand: () => number): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }

  return result
}

function getGridColumnsForTotalCards(totalCards: number): number {
  if (totalCards <= 2) return 2
  if (totalCards <= 4) return 2
  if (totalCards <= 6) return 3
  if (totalCards <= 12) return 4
  if (totalCards <= 20) return 5
  if (totalCards <= 30) return 6
  return 7
}

function arePositionsTouching(a: number, b: number, columns: number): boolean {
  const rowA = Math.floor(a / columns)
  const colA = a % columns
  const rowB = Math.floor(b / columns)
  const colB = b % columns

  return Math.abs(rowA - rowB) <= 1 && Math.abs(colA - colB) <= 1
}

function scoreCardLayout(cards: CardItem[], columns: number): number {
  const pairPositions = new Map<string, number[]>()

  cards.forEach((card, index) => {
    const current = pairPositions.get(card.pairId) ?? []
    current.push(index)
    pairPositions.set(card.pairId, current)
  })

  let score = 0

  pairPositions.forEach((positions) => {
    if (positions.length !== 2) return
    const [first, second] = positions
    const distance = Math.abs(first - second)

    if (arePositionsTouching(first, second, columns)) score -= 1000
    score += distance
  })

  return score
}

function getFairTargetScore(cards: CardItem[], level: number): number {
  const columns = getGridColumnsForTotalCards(cards.length)
  const scores: number[] = []

  for (let attempt = 0; attempt < 120; attempt++) {
    const rand = seededRandom(GAME_CONFIG.fairSeed + level * 1009 + attempt * 7919)
    const candidate = shuffleWithRandom(cards, rand)
    scores.push(scoreCardLayout(candidate, columns))
  }

  scores.sort((a, b) => a - b)
  return scores[Math.floor(scores.length * 0.65)] ?? 0
}

function fairShuffleCards(cards: CardItem[], level: number, seed: number): CardItem[] {
  const columns = getGridColumnsForTotalCards(cards.length)
  const targetScore = getFairTargetScore(cards, level)
  let best = cards
  let bestGap = Number.POSITIVE_INFINITY
  let bestScore = Number.NEGATIVE_INFINITY

  for (let attempt = 0; attempt < 160; attempt++) {
    const rand = seededRandom(seed + level * 1009 + attempt * 9176)
    const candidate = shuffleWithRandom(cards, rand)
    const score = scoreCardLayout(candidate, columns)
    const gap = Math.abs(score - targetScore)

    if (gap < bestGap || (gap === bestGap && score > bestScore)) {
      best = candidate
      bestGap = gap
      bestScore = score
    }
  }

  return best
}

function buildCards(level: number, seed = GAME_CONFIG.fairSeed): CardItem[] {
  const pairs = getPairsForLevel(level)
  const cards: CardItem[] = []

  for (let i = 0; i < pairs; i++) {
    const shape = getShapeForPairIndex(i)
    const pairId = `pair-${level}-${i}-${shape}`

    cards.push({ id: `${pairId}-a`, pairId, shape, isMatched: false })
    cards.push({ id: `${pairId}-b`, pairId, shape, isMatched: false })
  }

  return fairShuffleCards(cards, level, seed)
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "START": {
      const level = 1
      return {
        ...initial,
        phase: "memorize",
        level,
        seed: action.seed,
        cards: buildCards(level, action.seed),
      }
    }

    case "BEGIN_PLAY":
      return { ...state, phase: "playing", selectedIds: [] }

    case "SELECT_CARD":
      if (state.selectedIds.includes(action.cardId)) return state
      if (state.selectedIds.length >= 2) return state
      return { ...state, selectedIds: [...state.selectedIds, action.cardId] }

    case "MATCH_PAIR":
      return {
        ...state,
        cards: state.cards.map((card) =>
          card.id === action.firstId || card.id === action.secondId ? { ...card, isMatched: true } : card
        ),
        selectedIds: [],
        correctPairsInLevel: state.correctPairsInLevel + 1,
      }

    case "NEXT_LEVEL": {
      const nextLevel = state.level + 1
      return {
        ...state,
        phase: "memorize",
        level: nextLevel,
        cards: buildCards(nextLevel, state.seed),
        selectedIds: [],
        correctPairsInLevel: 0,
        wrongAttemptsInLevel: 0,
        levelHistory: [...state.levelHistory, action.record],
      }
    }

    case "FAIL":
      return {
        ...state,
        phase: "result",
        selectedIds: [],
        wrongAttemptsInLevel: state.wrongAttemptsInLevel + 1,
        levelHistory: [...state.levelHistory, action.record],
      }

    case "RESET":
      return initial

    default:
      return state
  }
}

function buildGameResult({
  playerId,
  sessionId,
  startedAt,
  endedAt,
  startIso,
  levelHistory,
  reactionTimesMs,
  fairSeed,
}: {
  playerId: string
  sessionId: string
  startedAt: number
  endedAt: number
  startIso: string
  levelHistory: LevelRecord[]
  reactionTimesMs: number[]
  fairSeed: number
}): GameResult {
  const completedLevels = levelHistory.filter((item) => item.completed).length
  const totalCorrectPairs = levelHistory.reduce((sum, item) => sum + item.correctPairs, 0)
  const totalWrongAttempts = levelHistory.reduce((sum, item) => sum + item.wrongAttempts, 0)
  const totalAttempts = totalCorrectPairs + totalWrongAttempts
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrectPairs / totalAttempts) * 100) : 0
  const failedLevel = levelHistory[levelHistory.length - 1]?.level ?? 0

  return {
    gameId: "symbol-matching",
    playerId,
    sessionId,
    gameName: "Symbol Matching Test",
    score: completedLevels * 100 + totalCorrectPairs * 10,
    accuracy,
    reactionTimesMs,
    startedAt: startIso,
    endedAt: new Date().toISOString(),
    durationMs: Math.round(endedAt - startedAt),
    rawData: {
      finalLevel: completedLevels,
      failedLevel,
      totalCorrectPairs,
      totalWrongAttempts,
      totalAttempts,
      memorizeTimeMs: GAME_CONFIG.memorizeTimeMs,
      fairSeed,
      levelHistory,
    },
  }
}

function ShapeIcon({ shape }: { shape: ShapeType }) {
  const common: React.CSSProperties = {
    width: 54,
    height: 54,
    background: "#111827",
    boxShadow: "0 10px 18px rgba(0,0,0,0.16)",
  }

  if (shape.startsWith("polygon-")) {
    const [, sidesText, rotationText] = shape.split("-")
    const sides = Number(sidesText) || 3
    const rotation = Number(rotationText) || 0
    return <div style={{ ...common, clipPath: polygonClipPath(sides, rotation) }} />
  }

  if (shape === "circle") return <div style={{ ...common, borderRadius: "50%" }} />
  if (shape === "square") return <div style={{ ...common, borderRadius: 6 }} />
  if (shape === "oval") return <div style={{ ...common, width: 66, height: 46, borderRadius: "50%" }} />
  if (shape === "rectangle") return <div style={{ ...common, width: 72, height: 42, borderRadius: 8 }} />
  if (shape === "roundedSquare") return <div style={{ ...common, borderRadius: 18 }} />
  if (shape === "pill") return <div style={{ ...common, width: 76, height: 42, borderRadius: 999 }} />
  if (shape === "ring") return <div style={{ ...common, borderRadius: "50%", background: "transparent", border: "12px solid #111827", boxSizing: "border-box" }} />

  if (shape === "triangle") {
    return (
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: "31px solid transparent",
          borderRight: "31px solid transparent",
          borderBottom: "58px solid #111827",
          filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.14))",
        }}
      />
    )
  }

  if (shape === "diamond") return <div style={{ ...common, width: 48, height: 48, borderRadius: 12, transform: "rotate(45deg)" }} />
  if (shape === "hexagon") return <div style={{ ...common, clipPath: "polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0 50%)" }} />
  if (shape === "wideHexagon") return <div style={{ ...common, width: 70, height: 48, clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)" }} />
  if (shape === "octagon") return <div style={{ ...common, clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }} />
  if (shape === "pentagon") return <div style={{ ...common, clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }} />
  if (shape === "trapezoid") return <div style={{ ...common, width: 66, height: 48, clipPath: "polygon(22% 0%, 78% 0%, 100% 100%, 0% 100%)" }} />
  if (shape === "parallelogram") return <div style={{ ...common, width: 66, height: 48, clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)" }} />
  if (shape === "leftTriangle") return <div style={{ ...common, clipPath: "polygon(0% 50%, 100% 0%, 100% 100%)" }} />
  if (shape === "rightTriangle") return <div style={{ ...common, clipPath: "polygon(0% 0%, 100% 50%, 0% 100%)" }} />
  if (shape === "cross") return <div style={{ ...common, clipPath: "polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%)" }} />
  if (shape === "xShape") return <div style={{ ...common, clipPath: "polygon(18% 0%, 50% 32%, 82% 0%, 100% 18%, 68% 50%, 100% 82%, 82% 100%, 50% 68%, 18% 100%, 0% 82%, 32% 50%, 0% 18%)" }} />
  if (shape === "kite") return <div style={{ ...common, width: 48, height: 66, clipPath: "polygon(50% 0%, 92% 38%, 50% 100%, 8% 38%)" }} />
  if (shape === "thinDiamond") return <div style={{ ...common, width: 38, height: 70, clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
  if (shape === "hourglass") return <div style={{ ...common, clipPath: "polygon(0% 0%, 100% 0%, 58% 50%, 100% 100%, 0% 100%, 42% 50%)" }} />
  if (shape === "semicircle") return <div style={{ ...common, width: 64, height: 34, borderRadius: "64px 64px 0 0" }} />

  return <div style={{ ...common, clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)" }} />
}

function CardFace({ card, hidden }: { card: CardItem; hidden: boolean }) {
  if (hidden) return null
  return <ShapeIcon shape={card.shape} />
}

export default function SymbolMatching({
  playerId = "test-player",
  sessionId = "test-session",
  onGameComplete = () => {},
}: GameProps) {
  const [state, dispatch] = useReducer(reducer, initial)
  const [timeLeftMs, setTimeLeftMs] = useState(GAME_CONFIG.memorizeTimeMs)
  const [locked, setLocked] = useState(false)

  const startPerfRef = useRef(0)
  const startIsoRef = useRef("")
  const levelStartRef = useRef(0)
  const lastActionRef = useRef(0)
  const reactionTimesRef = useRef<number[]>([])
  const completedRef = useRef(false)

  const pairsInLevel = state.level > 0 ? getPairsForLevel(state.level) : 0

  const matchedPairsInLevel = useMemo(() => {
    const matchedPairIds = new Set(
      state.cards
        .filter((card) => card.isMatched)
        .map((card) => card.pairId)
    )

    return matchedPairIds.size
  }, [state.cards])

  const selectedCards = useMemo(
    () => state.selectedIds.map((id) => state.cards.find((card) => card.id === id)).filter(Boolean) as CardItem[],
    [state.selectedIds, state.cards]
  )

  const createLevelRecord = useCallback(
    (completed: boolean, wrongAdd = 0): LevelRecord => ({
      level: state.level,
      pairs: pairsInLevel,
      totalCards: state.cards.length,
      completed,
      correctPairs: matchedPairsInLevel,
      wrongAttempts: state.wrongAttemptsInLevel + wrongAdd,
      durationMs: Math.round(performance.now() - levelStartRef.current),
    }),
    [state.level, pairsInLevel, state.cards.length, matchedPairsInLevel, state.wrongAttemptsInLevel]
  )

  const completeGame = useCallback(
    (history: LevelRecord[]) => {
      const result = buildGameResult({
        playerId,
        sessionId,
        startedAt: startPerfRef.current,
        endedAt: performance.now(),
        startIso: startIsoRef.current,
        levelHistory: history,
        reactionTimesMs: reactionTimesRef.current,
        fairSeed: state.seed,
      })

      onGameComplete(result)
    },
    [playerId, sessionId, onGameComplete]
  )

  const handleStart = () => {
    startPerfRef.current = performance.now()
    startIsoRef.current = new Date().toISOString()
    levelStartRef.current = performance.now()
    lastActionRef.current = performance.now()
    reactionTimesRef.current = []
    completedRef.current = false
    setLocked(false)
    setTimeLeftMs(GAME_CONFIG.memorizeTimeMs)
    dispatch({ type: "START", seed: createRunSeed(playerId, sessionId) })
  }

  useEffect(() => {
    if (state.phase !== "memorize") return

    levelStartRef.current = performance.now()
    completedRef.current = false
    setLocked(true)
    setTimeLeftMs(GAME_CONFIG.memorizeTimeMs)

    const interval = window.setInterval(() => {
      const elapsed = performance.now() - levelStartRef.current
      const remaining = Math.max(GAME_CONFIG.memorizeTimeMs - elapsed, 0)
      setTimeLeftMs(remaining)
    }, 100)

    const timer = window.setTimeout(() => {
      setLocked(false)
      lastActionRef.current = performance.now()
      dispatch({ type: "BEGIN_PLAY" })
    }, GAME_CONFIG.memorizeTimeMs)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timer)
    }
  }, [state.phase, state.level])

  useEffect(() => {
    if (selectedCards.length !== 2) return

    setLocked(true)
    const [first, second] = selectedCards
    const isMatch = first.pairId === second.pairId

    if (isMatch) {
      window.setTimeout(() => {
        dispatch({ type: "MATCH_PAIR", firstId: first.id, secondId: second.id })
        setLocked(false)
      }, GAME_CONFIG.correctPreviewMs)
      return
    }

    const record = createLevelRecord(false, 1)
    const history = [...state.levelHistory, record]

    window.setTimeout(() => {
      dispatch({ type: "FAIL", record })
      setLocked(false)
      completeGame(history)
    }, GAME_CONFIG.wrongPreviewMs)
  }, [selectedCards, createLevelRecord, state.levelHistory, completeGame])

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

  const handleCardClick = (card: CardItem) => {
    if (state.phase !== "playing") return
    if (locked || card.isMatched) return
    if (state.selectedIds.includes(card.id)) return

    const now = performance.now()
    reactionTimesRef.current.push(Math.round(now - lastActionRef.current))
    lastActionRef.current = now

    dispatch({ type: "SELECT_CARD", cardId: card.id })
  }

  const wrap: React.CSSProperties = {
    height: "100vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.75rem 1rem",
    gap: "0.7rem",
    background: "linear-gradient(135deg, #9bd8a5 0%, #70c7b8 100%)",
    fontFamily: FONT,
    color: "white",
  }

  const btn: React.CSSProperties = {
    background: "#f0b429",
    color: "#412402",
    border: "none",
    borderRadius: 10,
    padding: "13px 42px",
    fontSize: 17,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: FONT,
  }

  if (state.phase === "idle") {
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 34, fontWeight: 800, textAlign: "center", margin: 0 }}>Symbol Matching Test</h1>
        <p style={{ opacity: 0.85, textAlign: "center", margin: 0 }}>จำตำแหน่งรูปเรขาคณิต แล้วจับคู่ให้ถูกต้อง</p>
        <button style={btn} onClick={handleStart}>Start</button>
      </div>
    )
  }

  if (state.phase === "result") {
    const completed = state.levelHistory.filter((item) => item.completed).length
    const last = state.levelHistory[state.levelHistory.length - 1]
    const correctPairs = state.levelHistory.reduce((sum, item) => sum + item.correctPairs, 0)
    const score = completed * 100 + correctPairs * 10

    return (
      <div style={wrap}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>Game Over</h2>
        <div style={{ fontSize: 86, fontWeight: 900, lineHeight: 1 }}>{completed}</div>
        <p style={{ opacity: 0.9, textAlign: "center", margin: 0 }}>Level ที่ผ่านได้</p>
        <p style={{ opacity: 0.85, textAlign: "center" }}>กดผิดที่ Level {last?.level ?? 0} | Score: <strong>{score}</strong></p>
        <button style={btn} onClick={handleStart}>Try again</button>
        <button style={{ ...btn, background: "transparent", color: "#fff", border: "1.5px solid rgba(255,255,255,0.45)" }} onClick={() => dispatch({ type: "RESET" })}>Back</button>
      </div>
    )
  }

  const totalCards = state.cards.length
  const gridColumns = getGridColumnsForTotalCards(totalCards)
  const gridRows = Math.ceil(totalCards / gridColumns)
  const gridGap = totalCards <= 12 ? 14 : totalCards <= 24 ? 10 : 8
  const cardSize = `min(126px, calc((92vw - ${(gridColumns - 1) * gridGap}px) / ${gridColumns}), calc((62vh - ${(gridRows - 1) * gridGap}px) / ${gridRows}))`
  const seconds = Math.ceil(timeLeftMs / 1000)
  const hidden = state.phase === "playing"

  return (
    <div style={wrap}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          justifyContent: "center",
          alignItems: "center",
          lineHeight: 1.15,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700 }}>
          Level <strong style={{ fontSize: 34, color: "#f0e14a" }}>{state.level}</strong>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>
          Pairs <strong>{matchedPairsInLevel}/{pairsInLevel}</strong>
        </div>
        {state.phase === "memorize" && (
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            Memorize <strong>{seconds}s</strong>
          </div>
        )}
      </div>

      {state.phase === "memorize" && (
        <div style={{ width: "min(92vw, 760px)", height: 10, background: "rgba(255,255,255,0.25)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${(timeLeftMs / GAME_CONFIG.memorizeTimeMs) * 100}%`, height: "100%", background: "#f0e14a", transition: "width 0.1s linear" }} />
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridColumns}, ${cardSize})`,
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
                border: selected ? "4px solid #f0e14a" : "2px solid rgba(255,255,255,0.55)",
                background: card.isMatched ? "rgba(255,255,255,0.35)" : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.9))",
                boxShadow: selected ? "0 12px 24px rgba(240,225,74,0.22)" : "0 8px 18px rgba(20,83,45,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: state.phase !== "playing" || locked || card.isMatched ? "default" : "pointer",
                opacity: card.isMatched ? 0.25 : 1,
                transform: selected ? "scale(1.04)" : "scale(1)",
                transition: "all 0.12s ease",
              }}
            >
              <CardFace card={card} hidden={shouldHide} />
            </button>
          )
        })}
      </div>

      <p style={{ minHeight: 20, opacity: 0.85, textAlign: "center", margin: 0, fontSize: 15 }}>
        {state.phase === "memorize" ? "จำตำแหน่งรูปเรขาคณิตให้ได้ภายใน 15 วินาที" : "ต้องจับคู่ให้ครบทุกคู่ก่อน ถึงจะผ่านด่าน ถ้ากดผิดเกมจบทันที"}
      </p>
    </div>
  )
}
