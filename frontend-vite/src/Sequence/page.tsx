import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type GamePhase = 'idle' | 'showing' | 'input' | 'result'

interface GameState {
  phase: GamePhase
  level: number
  sequence: number[]
  playerInput: number[]
}

type Action =
  | { type: 'START' }
  | { type: 'BEGIN_INPUT' }
  | { type: 'NEXT_LEVEL' }
  | { type: 'PLAYER_PRESS'; cell: number }
  | { type: 'FAIL' }
  | { type: 'RESET' }

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initial: GameState = {
  phase: 'idle',
  level: 0,
  sequence: [],
  playerInput: [],
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START':
      return {
        phase: 'showing',
        level: 1,
        sequence: [Math.floor(Math.random() * 9)],
        playerInput: [],
      }
    case 'BEGIN_INPUT':
      return { ...state, phase: 'input', playerInput: [] }
    case 'NEXT_LEVEL':
      return {
        ...state,
        phase: 'showing',
        level: state.level + 1,
        sequence: [...state.sequence, Math.floor(Math.random() * 9)],
        playerInput: [],
      }
    case 'PLAYER_PRESS':
      return { ...state, playerInput: [...state.playerInput, action.cell] }
    case 'FAIL':
      return { ...state, phase: 'result' }
    case 'RESET':
      return initial
    default:
      return state
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const FLASH_ON_MS = 400
const FLASH_OFF_MS = 200

// ─── Cell Component ───────────────────────────────────────────────────────────

interface CellProps {
  index: number
  isLit: boolean
  isFailed: boolean
  isCorrect: boolean
  disabled: boolean
  onClick: (index: number) => void
}

const Cell: React.FC<CellProps> = ({ index, isLit, isFailed, isCorrect, disabled, onClick }) => {
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
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.08s ease, box-shadow 0.08s ease',
        boxShadow: isLit ? '0 0 0 3px rgba(255,255,255,0.45)' : 'none',
        outline: 'none',
      }}
    />
  )
}

// ─── Grid Component ───────────────────────────────────────────────────────────

interface GridProps {
  litCell: number | null
  failedCell: number | null
  correctCell: number | null
  disabled: boolean
  onCellClick: (index: number) => void
}

const Grid: React.FC<GridProps> = ({ litCell, failedCell, correctCell, disabled, onCellClick }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: '100%', maxWidth: 360 }}>
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

// ─── Square Icon ──────────────────────────────────────────────────────────────

const SquareIcon: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, width: 52, height: 52 }}>
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

// ─── Statistics Chart ─────────────────────────────────────────────────────────

// Approximate distribution (% of players per level reached)
const DIST: { level: number; pct: number }[] = [
  { level: 1, pct: 1 },  { level: 2, pct: 3 },  { level: 3, pct: 8 },
  { level: 4, pct: 14 }, { level: 5, pct: 19 }, { level: 6, pct: 17 },
  { level: 7, pct: 13 }, { level: 8, pct: 9 },  { level: 9, pct: 6 },
  { level: 10, pct: 4 }, { level: 11, pct: 3 }, { level: 12, pct: 2 },
  { level: 13, pct: 1 }, { level: 14, pct: 0.5 }, { level: 15, pct: 0.3 },
]

const StatsChart: React.FC = () => {
  const W = 300
  const H = 130
  const padT = 8, padB = 28, padL = 8, padR = 8
  const maxPct = Math.max(...DIST.map((d) => d.pct))
  const barW = (W - padL - padR) / DIST.length
  const chartH = H - padT - padB

  const coords = DIST.map((d, i) => ({
    x: padL + i * barW + barW / 2,
    y: padT + chartH - (d.pct / maxPct) * chartH,
  }))

  const bottomY = padT + chartH
  const areaPath =
    `M${coords[0].x},${bottomY} ` +
    coords.map((c) => `L${c.x},${c.y}`).join(' ') +
    ` L${coords[coords.length - 1].x},${bottomY} Z`

  const linePath = `M${coords.map((c) => `${c.x},${c.y}`).join(' L')}`

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="areafill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b8fd4" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3b8fd4" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {coords.map((c, i) => (
        <line key={i} x1={c.x} x2={c.x} y1={padT} y2={bottomY} stroke="#ebebeb" strokeWidth="1" />
      ))}
      {/* X axis */}
      <line x1={padL} x2={W - padR} y1={bottomY} y2={bottomY} stroke="#ddd" strokeWidth="1" />
      {/* Area */}
      <path d={areaPath} fill="url(#areafill)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="#3b8fd4" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* X labels */}
      {DIST.map((d, i) => (
        <text key={i} x={coords[i].x} y={H - 8} textAnchor="middle" fontSize="8" fill="#c0c0c0">
          {d.level}
        </text>
      ))}
    </svg>
  )
}

// ─── Info Section (visible on idle screen below hero) ────────────────────────

const InfoSection: React.FC = () => (
  <div style={{ width: '100%', background: '#eaeef4', padding: '2rem 1rem', display: 'flex', justifyContent: 'center' }}>
    <div
      style={{
        width: '100%',
        maxWidth: 760,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1rem',
      }}
    >
      {/* Statistics card */}
      <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem 1.5rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <h3 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: '1.25rem' }}>Statistics</h3>
        <StatsChart />
        <p style={{ fontSize: 11, color: '#c0c0c0', marginTop: 6, textAlign: 'center' }}>
          Level reached (% of players)
        </p>
      </div>

      {/* About card */}
      <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <h3 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: '1rem' }}>About the test</h3>
        <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, marginBottom: '0.75rem' }}>
          Memorize the sequence of buttons that light up, then press them in order.
        </p>
        <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, marginBottom: '0.75rem' }}>
          Every time you finish the pattern, it gets longer.
        </p>
        <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7 }}>
          Make a mistake, and the test is over.
        </p>
      </div>
    </div>
  </div>
)

// ─── Shared styles ────────────────────────────────────────────────────────────

const FONT = "'DM Sans', 'Segoe UI', sans-serif"

const gameWrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem 1rem',
  gap: '1.5rem',
  background: '#3b8fd4',
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

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function SequenceMemory() {
  const [state, dispatch] = useReducer(reducer, initial)
  const [litCell, setLitCell] = useState<number | null>(null)
  const [failedCell, setFailedCell] = useState<number | null>(null)
  const [correctCell, setCorrectCell] = useState<number | null>(null)

  const inputRef = useRef<number[]>([])
  const sequenceRef = useRef<number[]>([])

  useEffect(() => { inputRef.current = state.playerInput }, [state.playerInput])
  useEffect(() => { sequenceRef.current = state.sequence }, [state.sequence])

  // Play sequence animation
  useEffect(() => {
    if (state.phase !== 'showing') return
    let cancelled = false

    const play = async () => {
      await sleep(600)
      for (let i = 0; i < state.sequence.length; i++) {
        if (cancelled) return
        setLitCell(state.sequence[i])
        await sleep(FLASH_ON_MS)
        if (cancelled) return
        setLitCell(null)
        if (i < state.sequence.length - 1) await sleep(FLASH_OFF_MS)
      }
      await sleep(400)
      if (!cancelled) dispatch({ type: 'BEGIN_INPUT' })
    }

    play()
    return () => { cancelled = true; setLitCell(null) }
  }, [state.phase, state.sequence])

  const handleCellClick = useCallback(
    (cellIndex: number) => {
      if (state.phase !== 'input') return
      const position = inputRef.current.length
      const expected = sequenceRef.current[position]

      if (cellIndex !== expected) {
        setFailedCell(cellIndex)
        setTimeout(() => { dispatch({ type: 'FAIL' }); setFailedCell(null) }, 600)
        return
      }

      setCorrectCell(cellIndex)
      setTimeout(() => setCorrectCell(null), 180)
      dispatch({ type: 'PLAYER_PRESS', cell: cellIndex })

      if (position + 1 === sequenceRef.current.length) {
        setTimeout(() => dispatch({ type: 'NEXT_LEVEL' }), 800)
      }
    },
    [state.phase]
  )

  // ── Idle screen ───────────────────────────────────────────────────────────
  if (state.phase === 'idle') {
    return (
      <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#eaeef4' }}>
        {/* Hero */}
        <div
          style={{
            background: '#3b8fd4',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '3.5rem 1rem 4rem',
            gap: '1.25rem',
          }}
        >
          <SquareIcon />
          <h1 style={{ fontSize: 42, fontWeight: 700, textAlign: 'center', lineHeight: 1.15, margin: 0 }}>
            Sequence Memory Test
          </h1>
          <p style={{ fontSize: 16, opacity: 0.85, margin: 0 }}>Memorize the pattern.</p>
          <button style={btnYellow} onClick={() => dispatch({ type: 'START' })}>
            Start
          </button>
        </div>

        {/* Info section */}
        <InfoSection />
      </div>
    )
  }

  // ── Result screen ─────────────────────────────────────────────────────────
  if (state.phase === 'result') {
    const score = state.sequence.length - 1
    return (
      <div style={gameWrap}>
        <SquareIcon />
        <h2 style={{ fontSize: 22, fontWeight: 500 }}>You reached level</h2>
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1 }}>{state.level}</div>
        <p style={{ fontSize: 15, opacity: 0.75, textAlign: 'center', maxWidth: 280 }}>
          You successfully memorized <strong>{score}</strong> button{score !== 1 ? 's' : ''} in a row.
        </p>
        <button style={btnYellow} onClick={() => dispatch({ type: 'START' })}>Try again</button>
        <button style={btnGhost} onClick={() => dispatch({ type: 'RESET' })}>Back to menu</button>
      </div>
    )
  }

  // ── Game screen (showing / input) ─────────────────────────────────────────
  const remaining = state.sequence.length - state.playerInput.length
  const statusText =
    state.phase === 'showing'
      ? 'Watch the pattern...'
      : `Repeat the pattern — ${remaining} left`

  return (
    <div style={gameWrap}>
      <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: 1 }}>
        Level:{' '}
        <span style={{ fontSize: 28, fontWeight: 700, color: '#f0e14a' }}>{state.level}</span>
      </div>

      <Grid
        litCell={litCell}
        failedCell={failedCell}
        correctCell={correctCell}
        disabled={state.phase !== 'input'}
        onCellClick={handleCellClick}
      />

      <p style={{ fontSize: 15, opacity: 0.8, minHeight: 22 }}>{statusText}</p>
    </div>
  )
}