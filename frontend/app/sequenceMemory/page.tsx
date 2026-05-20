"use client"

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'

type GamePhase = 'idle' | 'showing' | 'input' | 'result'
type GridSize = 9 | 16 | 25

type LevelRule = {
  fromLevel: number
  toLevel?: number
  maxSameCellStreak: number
  pairsPerBlock: number
  blockSize: number
  minGapBetweenPairs: number
  maxStraightRun: number
  pairStartOffset: number
  localClusterWindow: number
  maxLocalClusterSpan: number
  rowGapEveryLevels: number
  minRowGap: number
}

type SequenceConfig = {
  maxLevel: number
  defaultGridSize: GridSize
  flashOnMs: number
  flashOffMs: number
  beforeShowMs: number
  afterShowMs: number
  nextLevelDelayMs: number
  levelRules: LevelRule[]
}

const GAME_CONFIG: SequenceConfig = {
  maxLevel: Number.POSITIVE_INFINITY,
  defaultGridSize: 9,
  flashOnMs: 400,
  flashOffMs: 200,
  beforeShowMs: 600,
  afterShowMs: 400,
  nextLevelDelayMs: 800,
  levelRules: [
    {
      fromLevel: 1,
      toLevel: 10,
      maxSameCellStreak: 2,
      pairsPerBlock: 2,
      blockSize: 10,
      minGapBetweenPairs: 3,
      maxStraightRun: 2,
      pairStartOffset: 4,
      localClusterWindow: 4,
      maxLocalClusterSpan: 2,
      rowGapEveryLevels: 2,
      minRowGap: 1,
    },
    {
      fromLevel: 11,
      maxSameCellStreak: 2,
      pairsPerBlock: 2,
      blockSize: 10,
      minGapBetweenPairs: 3,
      maxStraightRun: 2,
      pairStartOffset: 4,
      localClusterWindow: 4,
      maxLocalClusterSpan: 2,
      rowGapEveryLevels: 2,
      minRowGap: 1,
    },
  ],
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
    totalSequence: number
    gridSize: number
    sequences: number[][]
    mistakes: number
    correctClicks: number
    totalClicks: number
    speedLevel: number
    maxSameCellStreak: number
    pairsPerBlock: number
    blockSize: number
    maxStraightRun: number
    localClusterWindow: number
    maxLocalClusterSpan: number
    rowGapEveryLevels: number
    minRowGap: number
    fairnessScore: number
    frequencyMap: Record<number, number>
    fairnessRules: string[]
  }
}

interface GameProps {
  playerId?: string
  sessionId?: string
  onGameComplete?: (result: GameResult) => void
}

type CheckResult = 'correct' | 'complete' | 'wrong'

const GRID_OPTIONS: GridSize[] = [9, 16, 25]

function getGridColumns(gridSize: number): number {
  return Math.sqrt(gridSize)
}

function getRuleForLevel(level: number): LevelRule {
  return (
    GAME_CONFIG.levelRules.find((rule) => {
      const toLevel = rule.toLevel ?? Number.POSITIVE_INFINITY
      return level >= rule.fromLevel && level <= toLevel
    }) ?? GAME_CONFIG.levelRules[GAME_CONFIG.levelRules.length - 1]
  )
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max)
}

function shuffleNumbers(numbers: number[]): number[] {
  const result = [...numbers]

  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }

  return result
}

function createSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000)
}

function seededRandom(seed: number): () => number {
  let value = seed || 1

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

function shuffleNumbersWithRandom(numbers: number[], rand: () => number): number[] {
  const result = [...numbers]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }

  return result
}

function getPairLevelsForBlock(seed: number, blockIndex: number, rule: LevelRule): number[] {
  const blockStartLevel = blockIndex * rule.blockSize + 1
  const blockEndLevel = blockStartLevel + rule.blockSize - 1
  const minPairLevel = blockStartLevel + Math.max(rule.pairStartOffset - 1, 1)
  const rand = seededRandom(seed + blockIndex * 9973 + rule.blockSize * 313)
  const possibleLevels = []

  for (let level = minPairLevel; level <= blockEndLevel; level++) {
    possibleLevels.push(level)
  }

  const shuffled = shuffleNumbersWithRandom(possibleLevels, rand)
  const selected: number[] = []

  for (const level of shuffled) {
    const tooClose = selected.some((chosen) => Math.abs(chosen - level) <= rule.minGapBetweenPairs)
    if (!tooClose) selected.push(level)
    if (selected.length >= rule.pairsPerBlock) break
  }

  return selected.sort((a, b) => a - b)
}

function shouldPairAtLevel(nextLevel: number, seed: number): boolean {
  const rule = getRuleForLevel(nextLevel)
  const blockIndex = Math.floor((nextLevel - 1) / rule.blockSize)
  const pairLevels = getPairLevelsForBlock(seed, blockIndex, rule)
  return pairLevels.includes(nextLevel)
}

function getCurrentStreak(sequence: number[], cell: number): number {
  let streak = 0

  for (let i = sequence.length - 1; i >= 0; i--) {
    if (sequence[i] !== cell) break
    streak += 1
  }

  return streak
}

function getStraightAscendingRun(sequence: number[], nextCell: number): number {
  if (sequence.length === 0) return 1

  const candidate = [...sequence, nextCell]
  let run = 1

  for (let i = candidate.length - 1; i > 0; i--) {
    if (candidate[i] !== candidate[i - 1] + 1) break
    run += 1
  }

  return run
}

function getStraightDescendingRun(sequence: number[], nextCell: number): number {
  if (sequence.length === 0) return 1

  const candidate = [...sequence, nextCell]
  let run = 1

  for (let i = candidate.length - 1; i > 0; i--) {
    if (candidate[i] !== candidate[i - 1] - 1) break
    run += 1
  }

  return run
}

function getStraightVerticalRun(sequence: number[], nextCell: number, gridSize: number): number {
  if (sequence.length === 0) return 1

  const columns = getGridColumns(gridSize)
  const candidate = [...sequence, nextCell]
  let run = 1

  for (let i = candidate.length - 1; i > 0; i--) {
    const current = candidate[i]
    const previous = candidate[i - 1]
    const sameColumn = current % columns === previous % columns
    const nextRowDown = current === previous + columns
    const nextRowUp = current === previous - columns

    if (!sameColumn || (!nextRowDown && !nextRowUp)) break
    run += 1
  }

  return run
}

function wouldCreateLocalCluster(sequence: number[], nextCell: number, rule: LevelRule): boolean {
  if (sequence.length + 1 < rule.localClusterWindow) return false

  const candidate = [...sequence, nextCell]
  const tail = candidate.slice(candidate.length - rule.localClusterWindow)
  const min = Math.min(...tail)
  const max = Math.max(...tail)

  return max - min <= rule.maxLocalClusterSpan
}

function wouldCreateNaturalOrder(sequence: number[], nextCell: number, gridSize: number): boolean {
  if (sequence.length + 1 < gridSize) return false

  const candidate = [...sequence, nextCell]
  const tail = candidate.slice(candidate.length - gridSize)

  return tail.every((cell, index) => cell === index)
}



function buildFrequencyMap(sequence: number[], gridSize: number): Record<number, number> {
  const frequencyMap: Record<number, number> = {}

  for (let i = 0; i < gridSize; i++) {
    frequencyMap[i] = 0
  }

  for (const cell of sequence) {
    frequencyMap[cell] = (frequencyMap[cell] ?? 0) + 1
  }

  return frequencyMap
}

function getMaxWindowFrequency(sequence: number[], cell: number, windowSize: number): number {
  const tail = [...sequence, cell].slice(-windowSize)
  return tail.filter((item) => item === cell).length
}

function wouldBreakBalancedWindow(sequence: number[], cell: number, windowSize = 5, maxCount = 2): boolean {
  if (sequence.length + 1 < windowSize) return false
  return getMaxWindowFrequency(sequence, cell, windowSize) > maxCount
}

function calculateFairnessScore(sequence: number[], gridSize: number): number {
  if (sequence.length === 0) return 100

  const frequencyMap = buildFrequencyMap(sequence, gridSize)
  const values = Object.values(frequencyMap)
  const expected = sequence.length / gridSize
  const totalDeviation = values.reduce((sum, value) => sum + Math.abs(value - expected), 0)
  const maxDeviation = sequence.length * 2
  const score = 100 - (totalDeviation / maxDeviation) * 100

  return Math.max(0, Math.min(100, Math.round(score)))
}

function getLeastUsedCandidates(candidates: number[], sequence: number[], gridSize: number): number[] {
  const frequencyMap = buildFrequencyMap(sequence, gridSize)
  const minFrequency = Math.min(...candidates.map((cell) => frequencyMap[cell] ?? 0))
  const allowedFrequency = minFrequency + 1

  return candidates.filter((cell) => (frequencyMap[cell] ?? 0) <= allowedFrequency)
}

function getCellRow(cell: number, gridSize: number): number {
  const columns = getGridColumns(gridSize)
  return Math.floor(cell / columns)
}

function hasEnoughRowGap(previousCell: number, nextCell: number, gridSize: number, minRowGap: number): boolean {
  return Math.abs(getCellRow(previousCell, gridSize) - getCellRow(nextCell, gridSize)) >= minRowGap
}

function shouldUseRowGapRule(nextLevel: number, rule: LevelRule): boolean {
  return rule.rowGapEveryLevels > 0 && nextLevel % rule.rowGapEveryLevels === 0
}

function chooseDifferentCell(
  sequence: number[],
  nextLevel: number,
  gridSize: number,
  rule: LevelRule
): number {
  const lastCell = sequence[sequence.length - 1]
  const mustKeepRowGap = sequence.length > 0 && shouldUseRowGapRule(nextLevel, rule)

  const candidates = shuffleNumbers(Array.from({ length: gridSize }, (_, i) => i)).filter((cell) => {
    if (sequence.length > 0 && cell === lastCell) return false
    if (mustKeepRowGap && !hasEnoughRowGap(lastCell, cell, gridSize, rule.minRowGap)) return false
    if (getCurrentStreak(sequence, cell) + 1 > rule.maxSameCellStreak) return false
    if (getStraightAscendingRun(sequence, cell) > rule.maxStraightRun) return false
    if (getStraightDescendingRun(sequence, cell) > rule.maxStraightRun) return false
    if (getStraightVerticalRun(sequence, cell, gridSize) > rule.maxStraightRun) return false
    if (wouldCreateNaturalOrder(sequence, cell, gridSize)) return false
    if (wouldCreateLocalCluster(sequence, cell, rule)) return false
    if (wouldBreakBalancedWindow(sequence, cell)) return false
    return true
  })

  if (candidates.length > 0) {
    const fairCandidates = getLeastUsedCandidates(candidates, sequence, gridSize)
    return fairCandidates[0] ?? candidates[0]
  }

  const rowGapCandidates = shuffleNumbers(Array.from({ length: gridSize }, (_, i) => i)).filter((cell) => {
    if (sequence.length > 0 && cell === lastCell) return false
    if (mustKeepRowGap && !hasEnoughRowGap(lastCell, cell, gridSize, rule.minRowGap)) return false
    return true
  })

  if (rowGapCandidates.length > 0) return rowGapCandidates[0]

  return randomInt(gridSize)
}

function appendFairCell(sequence: number[], nextLevel: number, gridSize: number, seed: number): number[] {
  const rule = getRuleForLevel(nextLevel)
  const lastCell = sequence[sequence.length - 1]
  const canRepeatLast =
    sequence.length > 0 && getCurrentStreak(sequence, lastCell) + 1 <= rule.maxSameCellStreak
  const pairLevel = shouldPairAtLevel(nextLevel, seed)

  const mustKeepRowGap = sequence.length > 0 && shouldUseRowGapRule(nextLevel, rule)

  if (
    pairLevel &&
    !mustKeepRowGap &&
    canRepeatLast &&
    !wouldCreateLocalCluster(sequence, lastCell, rule) &&
    !wouldBreakBalancedWindow(sequence, lastCell)
  ) {
    return [...sequence, lastCell]
  }

  return [...sequence, chooseDifferentCell(sequence, nextLevel, gridSize, rule)]
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
  gridSize,
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
  gridSize: number
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
  const rule = getRuleForLevel(Math.max(level, 1))

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
      gridSize,
      sequences,
      mistakes,
      correctClicks,
      totalClicks,
      speedLevel: 1,
      maxSameCellStreak: rule.maxSameCellStreak,
      pairsPerBlock: rule.pairsPerBlock,
      blockSize: rule.blockSize,
      maxStraightRun: rule.maxStraightRun,
      localClusterWindow: rule.localClusterWindow,
      maxLocalClusterSpan: rule.maxLocalClusterSpan,
      rowGapEveryLevels: rule.rowGapEveryLevels,
      minRowGap: rule.minRowGap,
      fairnessScore: calculateFairnessScore(sequences[sequences.length - 1] ?? [], gridSize),
      frequencyMap: buildFrequencyMap(sequences[sequences.length - 1] ?? [], gridSize),
      fairnessRules: [
        'Anti-streak: cell เดิมซ้ำติดกันได้ไม่เกิน 2 ครั้ง',
        'Balanced window: 5 step ล่าสุด cell เดียวกันมีได้ไม่เกิน 2 ครั้ง',
        'Anti-bias shuffle: cell ที่ถูกใช้น้อยกว่าจะมีโอกาสถูกเลือกก่อน',
        'Anti-vertical: กันลำดับแนวตั้งตรงคอลัมน์ เช่น 1-4-7',
        'Row gap: ทุก 2 level บังคับกระโดดข้าม row',
      ],
    },
  }
}

interface GameState {
  phase: GamePhase
  level: number
  gridSize: GridSize
  sequence: number[]
  playerInput: number[]
  sequences: number[][]
  seed: number
}

type Action =
  | { type: 'SET_GRID_SIZE'; gridSize: GridSize }
  | { type: 'START' }
  | { type: 'BEGIN_INPUT' }
  | { type: 'NEXT_LEVEL' }
  | { type: 'PLAYER_PRESS'; cell: number }
  | { type: 'FAIL' }
  | { type: 'RESET' }

const initial: GameState = {
  phase: 'idle',
  level: 0,
  gridSize: GAME_CONFIG.defaultGridSize,
  sequence: [],
  playerInput: [],
  sequences: [],
  seed: 0,
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_GRID_SIZE':
      return {
        ...state,
        gridSize: action.gridSize,
      }

    case 'START': {
      const level = 1
      const seed = createSeed()
      const seq = appendFairCell([], level, state.gridSize, seed)

      return {
        phase: 'showing',
        level,
        gridSize: state.gridSize,
        sequence: seq,
        playerInput: [],
        sequences: [],
        seed,
      }
    }

    case 'BEGIN_INPUT':
      return {
        ...state,
        phase: 'input',
        playerInput: [],
      }

    case 'NEXT_LEVEL': {
      const nextLevel = state.level + 1
      const seq = appendFairCell(state.sequence, nextLevel, state.gridSize, state.seed)

      return {
        ...state,
        phase: 'showing',
        level: nextLevel,
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
      return {
        ...initial,
        gridSize: state.gridSize,
      }

    default:
      return state
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

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
  gridSize: GridSize
  litCell: number | null
  failedCell: number | null
  correctCell: number | null
  disabled: boolean
  onCellClick: (i: number) => void
}> = ({ gridSize, litCell, failedCell, correctCell, disabled, onCellClick }) => {
  const columns = getGridColumns(gridSize)
  const maxWidth = gridSize === 9 ? 360 : gridSize === 16 ? 420 : 470

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: gridSize === 25 ? 8 : 10,
        width: '100%',
        maxWidth,
      }}
    >
      {Array.from({ length: gridSize }, (_, i) => (
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
}

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

const optionWrap: React.CSSProperties = {
  display: 'flex',
  gap: 14,
  flexWrap: 'wrap',
  justifyContent: 'center',
}

const getGridButtonStyle = (active: boolean): React.CSSProperties => ({
  border: active ? '3px solid #ffffff' : '2px solid rgba(255,255,255,0.45)',
  background: active ? '#ffffff' : 'rgba(255,255,255,0.14)',
  color: active ? '#5fae6d' : 'white',
  borderRadius: 14,
  padding: '18px 30px',
  minWidth: 116,
  fontSize: 20,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: FONT,
  boxShadow: active ? '0 10px 22px rgba(255,255,255,0.22)' : 'none',
})


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
  const gridSizeRef = useRef<GridSize>(GAME_CONFIG.defaultGridSize)

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

  useEffect(() => {
    gridSizeRef.current = state.gridSize
  }, [state.gridSize])

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
      await sleep(GAME_CONFIG.beforeShowMs)

      for (let i = 0; i < state.sequence.length; i++) {
        if (cancelled) return

        setLit(state.sequence[i])
        await sleep(GAME_CONFIG.flashOnMs)

        if (cancelled) return

        setLit(null)

        if (i < state.sequence.length - 1) {
          await sleep(GAME_CONFIG.flashOffMs)
        }
      }

      await sleep(GAME_CONFIG.afterShowMs)

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
            gridSize: gridSizeRef.current,
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
        setTimeout(() => dispatch({ type: 'NEXT_LEVEL' }), GAME_CONFIG.nextLevelDelayMs)
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

        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: '0 0 10px', fontSize: 15, opacity: 0.85 }}>
            Select grid size
          </p>
          <div style={optionWrap}>
            {GRID_OPTIONS.map((size) => (
              <button
                key={size}
                type="button"
                style={getGridButtonStyle(state.gridSize === size)}
                onClick={() => dispatch({ type: 'SET_GRID_SIZE', gridSize: size })}
              >
                {getGridColumns(size)} x {getGridColumns(size)}
              </button>
            ))}
          </div>
        </div>

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
            maxWidth: 300,
          }}
        >
          Grid <strong>{getGridColumns(state.gridSize)} x {getGridColumns(state.gridSize)}</strong>
          &nbsp;|&nbsp; Score: <strong>{passed * 10}</strong>
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
        gridSize={state.gridSize}
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
