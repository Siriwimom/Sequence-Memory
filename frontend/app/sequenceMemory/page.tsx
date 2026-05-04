"use client"

/**
 * SequenceMemory.tsx
 *
 * เกม Sequence Memory Test
 * นักศึกษา: [ชื่อ-นามสกุล]
 * รหัสนักศึกษา: [รหัส]
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'

// ════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════

type GamePhase = 'idle' | 'showing' | 'input' | 'result'

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
    totalSequence: number
    gridSize: number
    sequences: number[][]
    mistakes: number
    correctClicks: number
    totalClicks: number
  }
}

interface GameProps {
  playerId?: string
  sessionId?: string
  onGameComplete?: (result: GameResult) => void
}

type CheckResult = 'correct' | 'complete' | 'wrong'

// ════════════════════════════════════════════════════════════
// LOGIC
// ════════════════════════════════════════════════════════════

function appendRandomCell(sequence: number[]): number[] {
  let nextCell = Math.floor(Math.random() * 9)

  while (true) {
    const lastCell = sequence[sequence.length - 1]
    const twoBackCell = sequence[sequence.length - 2]

    // ห้ามซ้ำติดกัน เช่น 1,1
    if (sequence.length >= 1 && nextCell === lastCell) {
      nextCell = Math.floor(Math.random() * 9)
      continue
    }

    // ห้าม pattern ง่ายเกินไป เช่น 1,2,1
    if (sequence.length >= 2 && nextCell === twoBackCell) {
      nextCell = Math.floor(Math.random() * 9)
      continue
    }

    break
  }

  return [...sequence, nextCell]
}

function checkInput(
  sequence: number[],
  currentInput: number[],
  cellIndex: number
): CheckResult {
  const nextIndex = currentInput.length

  if (sequence[nextIndex] !== cellIndex) {
    return 'wrong'
  }

  if (nextIndex + 1 === sequence.length) {
    return 'complete'
  }

  return 'correct'
}

function buildGameResult({
  playerId,
  sessionId,
  level,
  startedAt,
  endedAt,
  startIso,
  sequences,
  mistakes,
  correctClicks,
  totalClicks,
  reactionTimesMs,
}: {
  playerId: string
  sessionId: string
  level: number
  startedAt: number
  endedAt: number
  startIso: string
  sequences: number[][]
  mistakes: number
  correctClicks: number
  totalClicks: number
  reactionTimesMs: number[]
}): GameResult {
  const passedLevel = Math.max(level - 1, 0)
  const accuracy = totalClicks > 0 ? Math.round((correctClicks / totalClicks) * 100) : 0

  return {
    gameId: 'sequence-memory',
    playerId,
    sessionId,
    gameName: 'Sequence Memory Test',
    score: passedLevel * 10,
    accuracy,
    reactionTimesMs,
    startedAt: startIso,
    endedAt: new Date().toISOString(),
    durationMs: Math.round(endedAt - startedAt),
    rawData: {
      finalLevel: passedLevel,
      totalSequence: sequences.length,
      gridSize: 9,
      sequences,
      mistakes,
      correctClicks,
      totalClicks,
    },
  }
}

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

interface GameState {
  phase: GamePhase
  level: number
  sequence: number[]
  playerInput: number[]
  sequences: number[][]
}

type Action =
  | { type: 'START' }
  | { type: 'BEGIN_INPUT' }
  | { type: 'NEXT_LEVEL' }
  | { type: 'PLAYER_PRESS'; cell: number }
  | { type: 'FAIL' }
  | { type: 'RESET' }

const initial: GameState = {
  phase: 'idle',
  level: 0,
  sequence: [],
  playerInput: [],
  sequences: [],
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START': {
      const seq = appendRandomCell([])
      return {
        phase: 'showing',
        level: 1,
        sequence: seq,
        playerInput: [],
        sequences: [],
      }
    }

    case 'BEGIN_INPUT':
      return {
        ...state,
        phase: 'input',
        playerInput: [],
      }

    case 'NEXT_LEVEL': {
      const seq = appendRandomCell(state.sequence)
      return {
        ...state,
        phase: 'showing',
        level: state.level + 1,
        sequence: seq,
        playerInput: [],
        sequences: [...state.sequences, state.sequence],
      }
    }

    case 'PLAYER_PRESS':
      return {
        ...state,
        playerInput: [...state.playerInput, action.cell],
      }

    case 'FAIL':
      return {
        ...state,
        phase: 'result',
      }

    case 'RESET':
      return initial

    default:
      return state
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const FLASH_ON = 400
const FLASH_OFF = 200

// ════════════════════════════════════════════════════════════
// SUB COMPONENTS
// ════════════════════════════════════════════════════════════

interface CellProps {
  index: number
  isLit: boolean
  isFailed: boolean
  isCorrect: boolean
  disabled: boolean
  onClick: (i: number) => void
}

const Cell: React.FC<CellProps> = ({
  index,
  isLit,
  isFailed,
  isCorrect,
  disabled,
  onClick,
}) => {
  const bg = isFailed
    ? 'rgba(220,60,50,0.9)'
    : isCorrect
      ? 'rgba(255,255,255,0.65)'
      : isLit
        ? 'rgba(255,255,255,0.95)'
        : 'rgba(255,255,255,0.18)'

  return (
    <button
      aria-label={`cell ${index + 1}`}
      disabled={disabled}
      onClick={() => onClick(index)}
      style={{
        width: '100%',
        aspectRatio: '1',
        background: bg,
        border: 'none',
        borderRadius: 10,
        outline: 'none',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.08s ease',
        boxShadow: isLit ? '0 0 0 3px rgba(255,255,255,0.45)' : 'none',
      }}
    />
  )
}

const Grid: React.FC<{
  litCell: number | null
  failedCell: number | null
  correctCell: number | null
  disabled: boolean
  onCellClick: (i: number) => void
}> = ({ litCell, failedCell, correctCell, disabled, onCellClick }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 10,
      width: '100%',
      maxWidth: 360,
    }}
  >
    {Array.from({ length: 9 }, (_, i) => (
      <Cell
        key={i}
        index={i}
        isLit={litCell === i}
        isFailed={failedCell === i}
        isCorrect={correctCell === i}
        disabled={disabled}
        onClick={onCellClick}
      />
    ))}
  </div>
)

const SquareIcon: React.FC = () => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 5,
      width: 52,
      height: 52,
    }}
  >
    {[0, 1, 2, 3].map((i) => (
      <div
        key={i}
        style={{
          background: i === 3 ? 'transparent' : 'rgba(255,255,255,0.7)',
          border: i === 3 ? '2px solid rgba(255,255,255,0.45)' : 'none',
          borderRadius: 5,
        }}
      />
    ))}
  </div>
)

// ════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════

const FONT = "'DM Sans','Segoe UI',sans-serif"

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem 1rem',
  gap: '1.5rem',
  background: '#9bd8a5',
  fontFamily: FONT,
  color: 'white',
}

const btnYellow: React.CSSProperties = {
  background: '#f0b429',
  color: '#412402',
  border: 'none',
  borderRadius: 8,
  padding: '13px 52px',
  fontSize: 17,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FONT,
}

const btnGhost: React.CSSProperties = {
  ...btnYellow,
  background: 'transparent',
  color: 'rgba(255,255,255,0.75)',
  border: '1.5px solid rgba(255,255,255,0.35)',
}

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════

export default function SequenceMemory({
  playerId = 'test-player',
  sessionId = 'test-session',
  onGameComplete = () => {},
}: GameProps) {
  const [state, dispatch] = useReducer(reducer, initial)
  const [litCell, setLit] = useState<number | null>(null)
  const [failedCell, setFail] = useState<number | null>(null)
  const [correctCell, setCor] = useState<number | null>(null)

  const startPerfRef = useRef<number>(0)
  const startIsoRef = useRef<string>('')

  const inputRef = useRef<number[]>([])
  const seqRef = useRef<number[]>([])
  const seqsRef = useRef<number[][]>([])

  const inputStartRef = useRef<number>(0)
  const mistakesRef = useRef<number>(0)
  const correctClicksRef = useRef<number>(0)
  const totalClicksRef = useRef<number>(0)
  const reactionTimesRef = useRef<number[]>([])

  useEffect(() => {
    inputRef.current = state.playerInput
  }, [state.playerInput])

  useEffect(() => {
    seqRef.current = state.sequence
  }, [state.sequence])

  useEffect(() => {
    seqsRef.current = state.sequences
  }, [state.sequences])

  const handleStart = () => {
    startPerfRef.current = performance.now()
    startIsoRef.current = new Date().toISOString()

    inputStartRef.current = 0
    mistakesRef.current = 0
    correctClicksRef.current = 0
    totalClicksRef.current = 0
    reactionTimesRef.current = []

    setFail(null)
    setCor(null)
    setLit(null)
    dispatch({ type: 'START' })
  }

  useEffect(() => {
    if (state.phase !== 'showing') return

    let cancelled = false

    const play = async () => {
      await sleep(600)

      for (let i = 0; i < state.sequence.length; i++) {
        if (cancelled) return

        setLit(state.sequence[i])
        await sleep(FLASH_ON)

        if (cancelled) return

        setLit(null)

        if (i < state.sequence.length - 1) {
          await sleep(FLASH_OFF)
        }
      }

      await sleep(400)

      if (!cancelled) {
        inputStartRef.current = performance.now()
        dispatch({ type: 'BEGIN_INPUT' })
      }
    }

    play()

    return () => {
      cancelled = true
      setLit(null)
    }
  }, [state.phase, state.sequence])

  const handleCellClick = useCallback(
    (cellIndex: number) => {
      if (state.phase !== 'input') return

      totalClicksRef.current += 1

      if (inputStartRef.current > 0) {
        reactionTimesRef.current.push(
          Math.round(performance.now() - inputStartRef.current)
        )
      }

      const result = checkInput(seqRef.current, inputRef.current, cellIndex)

      if (result === 'wrong') {
        mistakesRef.current += 1
        setFail(cellIndex)

        setTimeout(() => {
          dispatch({ type: 'FAIL' })
          setFail(null)

          const gameResult = buildGameResult({
            playerId,
            sessionId,
            level: state.level,
            startedAt: startPerfRef.current,
            endedAt: performance.now(),
            startIso: startIsoRef.current,
            sequences: [...seqsRef.current, seqRef.current],
            mistakes: mistakesRef.current,
            correctClicks: correctClicksRef.current,
            totalClicks: totalClicksRef.current,
            reactionTimesMs: reactionTimesRef.current,
          })

          onGameComplete(gameResult)
        }, 600)

        return
      }

      correctClicksRef.current += 1

      setCor(cellIndex)
      setTimeout(() => setCor(null), 180)

      dispatch({ type: 'PLAYER_PRESS', cell: cellIndex })

      if (result === 'complete') {
        setTimeout(() => dispatch({ type: 'NEXT_LEVEL' }), 800)
      }
    },
    [state.phase, state.level, playerId, sessionId, onGameComplete]
  )

  if (state.phase === 'idle') {
    return (
      <div style={wrap}>
        <SquareIcon />
        <h1
          style={{
            fontSize: 36,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          Sequence Memory Test
        </h1>
        <p style={{ fontSize: 16, opacity: 0.85 }}>Memorize the pattern.</p>
        <button style={btnYellow} onClick={handleStart}>
          Start
        </button>
      </div>
    )
  }

  if (state.phase === 'result') {
    const passed = Math.max(state.level - 1, 0)

    return (
      <div style={wrap}>
        <SquareIcon />
        <h2 style={{ fontSize: 22, fontWeight: 500 }}>You reached level</h2>
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1 }}>
          {passed}
        </div>
        <p
          style={{
            fontSize: 15,
            opacity: 0.75,
            textAlign: 'center',
            maxWidth: 280,
          }}
        >
          ผ่าน <strong>{passed}</strong> ระดับ &nbsp;|&nbsp; Score:{' '}
          <strong>{passed * 10}</strong>
        </p>
        <button style={btnYellow} onClick={handleStart}>
          Try again
        </button>
        <button style={btnGhost} onClick={() => dispatch({ type: 'RESET' })}>
          Back
        </button>
      </div>
    )
  }

  const remaining = state.sequence.length - state.playerInput.length
  const status =
    state.phase === 'showing'
      ? 'Watch the pattern...'
      : `Repeat the pattern — ${remaining} left`

  return (
    <div style={wrap}>
      <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: 1 }}>
        Level:{' '}
        <span style={{ fontSize: 28, fontWeight: 700, color: '#f0e14a' }}>
          {state.level}
        </span>
      </div>

      <Grid
        litCell={litCell}
        failedCell={failedCell}
        correctCell={correctCell}
        disabled={state.phase !== 'input'}
        onCellClick={handleCellClick}
      />

      <p style={{ fontSize: 15, opacity: 0.8, minHeight: 22 }}>{status}</p>
    </div>
  )
}