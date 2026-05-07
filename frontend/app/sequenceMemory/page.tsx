"use client" 

/**
 * SequenceMemory
 * เกม Sequence Memory Test
 * ชื่อ-นามสกุล: สิริวิมล แสงทอง
 * รหัสนักศึกษา: 6530300554
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react' // import React และ Hook ที่ใช้ควบคุม state, effect, reducer และค่าที่ไม่อยากให้ render ใหม่




type GamePhase = 'idle' | 'showing' | 'input' | 'result' // กำหนดสถานะของเกม: ยังไม่เริ่ม, กำลังโชว์, รอผู้เล่นกด, แสดงผลลัพธ์

interface GameResult { // โครงสร้างข้อมูลผลลัพธ์หลังเล่นจบ
  gameId: string // รหัสเกม
  playerId: string // รหัสผู้เล่น
  sessionId: string // รหัสรอบการเล่น/session
  gameName: string // ชื่อเกม
  score: number // คะแนนที่ได้
  accuracy: number // ความแม่นยำเป็นเปอร์เซ็นต์
  reactionTimesMs: number[] // เก็บเวลาตอบสนองของผู้เล่นแต่ละครั้งเป็นมิลลิวินาที
  startedAt: string // เวลาเริ่มเกมแบบ ISO string
  endedAt: string // เวลาจบเกมแบบ ISO string
  durationMs: number // ระยะเวลาที่ใช้เล่นทั้งหมดเป็นมิลลิวินาที
  rawData: { // ข้อมูลดิบของการเล่น ใช้ส่งไป backend หรือวิเคราะห์ต่อ
    finalLevel: number // เลเวลสุดท้ายที่ผ่านได้
    totalSequence: number // จำนวนชุดลำดับที่เกิดขึ้นทั้งหมด
    gridSize: number // จำนวนช่องทั้งหมดในตาราง ในที่นี้คือ 9 ช่อง
    sequences: number[][] // เก็บลำดับของแต่ละเลเวล
    mistakes: number // จำนวนครั้งที่กดผิด
    correctClicks: number // จำนวนครั้งที่กดถูก
    totalClicks: number // จำนวนครั้งที่กดทั้งหมด
    speedLevel: number // ระดับความเร็วของเกมตอนจบ
  }
}

interface GameProps { // props ที่ component นี้รับจากภายนอก
  playerId?: string // รหัสผู้เล่น ถ้าไม่ส่งมาจะใช้ค่า default
  sessionId?: string // รหัส session ถ้าไม่ส่งมาจะใช้ค่า default
  onGameComplete?: (result: GameResult) => void // callback ที่เรียกเมื่อเกมจบ พร้อมส่งผลลัพธ์ออกไป
}

type CheckResult = 'correct' | 'complete' | 'wrong' // ผลการตรวจการกด: ถูก, ครบชุด, ผิด

// ════════════════════════════════════════════════════════════
// LOGIC // ส่วน logic หลักของเกม
// ════════════════════════════════════════════════════════════

function appendRandomCell(sequence: number[]): number[] { // ฟังก์ชันสุ่มช่องใหม่แล้วต่อท้าย sequence เดิม
  let nextCell = Math.floor(Math.random() * 9) // สุ่มเลขช่องตั้งแต่ 0-8 เพราะมี 9 ช่อง

  while (true) { // วนจนกว่าจะได้เลขที่ไม่ซ้ำติดกันและไม่เป็น pattern ง่าย
    const lastCell = sequence[sequence.length - 1] // เก็บช่องล่าสุดของ sequence เดิม
    const twoBackCell = sequence[sequence.length - 2] // เก็บช่องก่อนหน้าล่าสุด 2 ตำแหน่ง

    // ห้ามซ้ำติดกัน เช่น 1,1
    if (sequence.length >= 1 && nextCell === lastCell) { // ถ้ามีข้อมูลเดิมและเลขใหม่ซ้ำกับช่องล่าสุด
      nextCell = Math.floor(Math.random() * 9) // สุ่มเลขใหม่อีกครั้ง
      continue // กลับไปตรวจเงื่อนไขใหม่
    }

    // ห้าม pattern ง่ายเกินไป เช่น 1,2,1
    if (sequence.length >= 2 && nextCell === twoBackCell) { // ถ้าเลขใหม่ซ้ำกับช่องก่อนหน้า 2 ตำแหน่ง จะเกิด pattern ง่าย
      nextCell = Math.floor(Math.random() * 9) // สุ่มเลขใหม่อีกครั้ง
      continue // กลับไปตรวจเงื่อนไขใหม่
    }

    break // ถ้าผ่านทุกเงื่อนไขแล้วให้ออกจาก loop
  }

  return [...sequence, nextCell] // ส่ง sequence เดิมบวกช่องใหม่กลับไป
}

function checkInput( // ฟังก์ชันตรวจว่าผู้เล่นกดถูกลำดับหรือไม่
  sequence: number[], // ลำดับที่ระบบกำหนดให้จำ
  currentInput: number[], // ลำดับที่ผู้เล่นกดไปแล้ว
  cellIndex: number // ช่องที่ผู้เล่นเพิ่งกด
): CheckResult { // คืนผลเป็น correct / complete / wrong
  const nextIndex = currentInput.length // ตำแหน่งถัดไปที่ต้องตรวจ เท่ากับจำนวนที่ผู้เล่นกดไปแล้ว

  if (sequence[nextIndex] !== cellIndex) { // ถ้าช่องที่กดไม่ตรงกับลำดับที่ควรกด
    return 'wrong' // ส่งผลว่ากดผิด
  }

  if (nextIndex + 1 === sequence.length) { // ถ้ากดถูกและจำนวนที่กดครบตาม sequence แล้ว
    return 'complete' // ส่งผลว่าผ่านเลเวลนี้แล้ว
  }

  return 'correct' // ถ้ากดถูกแต่ยังไม่ครบ sequence
}

function buildGameResult({ // ฟังก์ชันสร้าง object ผลลัพธ์ตอนเกมจบ
  playerId, // รับรหัสผู้เล่น
  sessionId, // รับรหัส session
  level, // รับเลเวลปัจจุบัน
  startedAt, // รับเวลาเริ่มแบบ performance.now()
  endedAt, // รับเวลาจบแบบ performance.now()
  startIso, // รับเวลาเริ่มแบบ ISO string
  sequences, // รับ sequence ทั้งหมดที่เล่น
  mistakes, // รับจำนวนครั้งที่ผิด
  correctClicks, // รับจำนวนคลิกที่ถูก
  totalClicks, // รับจำนวนคลิกทั้งหมด
  reactionTimesMs, // รับเวลาตอบสนองทั้งหมด
  speedLevel, // รับระดับความเร็วของเกมตอนจบ
}: { // กำหนด type ของ parameter object
  playerId: string // playerId ต้องเป็น string
  sessionId: string // sessionId ต้องเป็น string
  level: number // level ต้องเป็น number
  startedAt: number // startedAt ต้องเป็น number
  endedAt: number // endedAt ต้องเป็น number
  startIso: string // startIso ต้องเป็น string
  sequences: number[][] // sequences เป็น array 2 มิติของ number
  mistakes: number // mistakes เป็น number
  correctClicks: number // correctClicks เป็น number
  totalClicks: number // totalClicks เป็น number
  reactionTimesMs: number[] // reactionTimesMs เป็น array ของ number
  speedLevel: number // speedLevel เป็น number ใช้บอกระดับความเร็ว
}): GameResult { // ฟังก์ชันนี้คืนค่าเป็น GameResult
  const passedLevel = Math.max(level - 1, 0) // คำนวณเลเวลที่ผ่านจริง โดยลบ 1 จากเลเวลที่แพ้ และไม่ให้ต่ำกว่า 0
  const accuracy = totalClicks > 0 ? Math.round((correctClicks / totalClicks) * 100) : 0 // คำนวณเปอร์เซ็นต์ความแม่นยำ ถ้ายังไม่คลิกให้เป็น 0

  return { // ส่ง object ผลลัพธ์กลับไป
    gameId: 'sequence-memory', // กำหนดรหัสเกม
    playerId, // ใส่รหัสผู้เล่น
    sessionId, // ใส่รหัส session
    gameName: 'Sequence Memory Test', // ใส่ชื่อเกม
    score: passedLevel * 10, // คะแนนคิดจากเลเวลที่ผ่าน คูณ 10
    accuracy, // ใส่ค่าความแม่นยำ
    reactionTimesMs, // ใส่เวลาตอบสนอง
    startedAt: startIso, // ใส่เวลาเริ่มเกม
    endedAt: new Date().toISOString(), // ใส่เวลาจบเกมเป็นเวลาปัจจุบัน
    durationMs: Math.round(endedAt - startedAt), // คำนวณเวลาที่เล่นทั้งหมด
    rawData: { // ใส่ข้อมูลดิบเพิ่มเติม
      finalLevel: passedLevel, // เลเวลสุดท้ายที่ผ่านได้
      totalSequence: sequences.length, // จำนวน sequence ทั้งหมด
      gridSize: 9, // ตารางมี 9 ช่อง
      sequences, // เก็บ sequence ที่เล่นทั้งหมด
      mistakes, // เก็บจำนวนครั้งที่ผิด
      correctClicks, // เก็บจำนวนคลิกที่ถูก
      totalClicks, // เก็บจำนวนคลิกทั้งหมด
      speedLevel, // เก็บระดับความเร็วตอนจบเกม
    },
  }
}

// ════════════════════════════════════════════════════════════
// STATE // ส่วนกำหนด state และ action ของเกม
// ════════════════════════════════════════════════════════════

interface GameState { // โครงสร้าง state หลักของเกม
  phase: GamePhase // สถานะปัจจุบันของเกม
  level: number // เลเวลปัจจุบัน
  sequence: number[] // sequence ของเลเวลปัจจุบัน
  playerInput: number[] // ลำดับที่ผู้เล่นกดในเลเวลปัจจุบัน
  sequences: number[][] // sequence ของเลเวลที่ผ่านไปแล้ว
}

type Action = // action ที่ reducer รองรับ
  | { type: 'START' } // เริ่มเกมใหม่
  | { type: 'BEGIN_INPUT' } // เปลี่ยนไปโหมดให้ผู้เล่นกด
  | { type: 'NEXT_LEVEL' } // ไปเลเวลถัดไป
  | { type: 'PLAYER_PRESS'; cell: number } // ผู้เล่นกดช่อง พร้อมเลขช่องที่กด
  | { type: 'FAIL' } // ผู้เล่นกดผิดและจบเกม
  | { type: 'RESET' } // รีเซ็ตกลับหน้าเริ่มต้น

const initial: GameState = { // ค่าเริ่มต้นของเกม
  phase: 'idle', // เริ่มต้นยังไม่เล่น
  level: 0, // เลเวลเริ่มที่ 0
  sequence: [], // ยังไม่มี sequence
  playerInput: [], // ยังไม่มี input จากผู้เล่น
  sequences: [], // ยังไม่มีประวัติ sequence
}

function reducer(state: GameState, action: Action): GameState { // reducer ใช้เปลี่ยน state ตาม action
  switch (action.type) { // ตรวจชนิดของ action
    case 'START': { // กรณีกดเริ่มเกม
      const seq = appendRandomCell([]) // สุ่ม sequence แรก 1 ช่อง
      return { // คืน state ใหม่
        phase: 'showing', // เปลี่ยนเป็นโหมดกำลังโชว์ลำดับ
        level: 1, // เริ่มที่เลเวล 1
        sequence: seq, // เก็บ sequence ที่สุ่มได้
        playerInput: [], // ล้าง input ผู้เล่น
        sequences: [], // ล้างประวัติ sequence
      }
    }

    case 'BEGIN_INPUT': // กรณีระบบโชว์ sequence เสร็จแล้ว
      return { // คืน state ใหม่
        ...state, // คงค่าเดิมทั้งหมดไว้
        phase: 'input', // เปลี่ยนเป็นโหมดรอผู้เล่นกด
        playerInput: [], // ล้าง input เพื่อเริ่มรับคำตอบใหม่
      }

    case 'NEXT_LEVEL': { // กรณีผู้เล่นกดครบและถูกทั้งหมด
      const seq = appendRandomCell(state.sequence) // เพิ่มช่องใหม่ต่อท้าย sequence เดิม
      return { // คืน state ใหม่
        ...state, // คงค่าเดิมไว้
        phase: 'showing', // กลับไปโหมดโชว์ลำดับใหม่
        level: state.level + 1, // เพิ่มเลเวล 1
        sequence: seq, // ใช้ sequence ใหม่ที่ยาวขึ้น
        playerInput: [], // ล้าง input ของผู้เล่น
        sequences: [...state.sequences, state.sequence], // เก็บ sequence เก่าที่ผ่านแล้วลงประวัติ
      }
    }

    case 'PLAYER_PRESS': // กรณีผู้เล่นกดช่อง
      return { // คืน state ใหม่
        ...state, // คงค่าเดิมไว้
        playerInput: [...state.playerInput, action.cell], // เพิ่มช่องที่ผู้เล่นกดลงใน playerInput
      }

    case 'FAIL': // กรณีผู้เล่นกดผิด
      return { // คืน state ใหม่
        ...state, // คงค่าเดิมไว้
        phase: 'result', // เปลี่ยนไปหน้าแสดงผลลัพธ์
      }

    case 'RESET': // กรณีกดกลับหรือรีเซ็ต
      return initial // กลับไปค่าเริ่มต้นทั้งหมด

    default: // ถ้า action ไม่ตรงกับที่กำหนด
      return state // คืน state เดิม
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS // ฟังก์ชันช่วยและค่าคงที่
// ════════════════════════════════════════════════════════════

const sleep = (ms: number): Promise<void> => // ฟังก์ชันหน่วงเวลาแบบ Promise
  new Promise((resolve) => setTimeout(resolve, ms)) // รอครบ ms แล้วค่อย resolve

const FLASH_ON = 400 // ระยะเวลาที่ช่องสว่างตอนโชว์ลำดับ หน่วย ms
const FLASH_OFF = 200 // ระยะเวลาพักระหว่างช่อง หน่วย ms
const LEVELS_PER_SPEED_UP = 3 // ทุก ๆ 3 เลเวลที่ผ่าน ความเร็วจะเพิ่มขึ้น 1 ระดับ
const SPEED_UP_STEP_ON = 60 // ทุกครั้งที่เพิ่มความเร็ว จะลดเวลาเปิดไฟลง 60 ms
const SPEED_UP_STEP_OFF = 30 // ทุกครั้งที่เพิ่มความเร็ว จะลดเวลาพักระหว่างช่องลง 30 ms
const MIN_FLASH_ON = 160 // กำหนดเวลาต่ำสุดที่ช่องสว่าง เพื่อไม่ให้เร็วเกินจนมองไม่ทัน
const MIN_FLASH_OFF = 80 // กำหนดเวลาพักต่ำสุดระหว่างช่อง เพื่อไม่ให้ animation เร็วเกินไป

const getSpeedLevel = (level: number): number => // ฟังก์ชันคำนวณระดับความเร็วจากเลเวลปัจจุบัน
  Math.floor(Math.max(level - 1, 0) / LEVELS_PER_SPEED_UP) + 1 // Level 1-5 = speed 1, Level 6-10 = speed 2, Level 11-15 = speed 3

const getFlashOnTime = (speedLevel: number): number => // ฟังก์ชันคำนวณเวลาที่ช่องสว่างตามระดับความเร็ว
  Math.max(MIN_FLASH_ON, FLASH_ON - (speedLevel - 1) * SPEED_UP_STEP_ON) // ยิ่ง speedLevel สูง เวลาสว่างยิ่งน้อย แต่ไม่ต่ำกว่า MIN_FLASH_ON

const getFlashOffTime = (speedLevel: number): number => // ฟังก์ชันคำนวณเวลาพักระหว่างช่องตามระดับความเร็ว
  Math.max(MIN_FLASH_OFF, FLASH_OFF - (speedLevel - 1) * SPEED_UP_STEP_OFF) // ยิ่ง speedLevel สูง เวลาพักยิ่งน้อย แต่ไม่ต่ำกว่า MIN_FLASH_OFF

// ════════════════════════════════════════════════════════════
// SUB COMPONENTS // component ย่อยที่ใช้ประกอบหน้าจอ
// ════════════════════════════════════════════════════════════

interface CellProps { // props ของช่องแต่ละช่องในตาราง
  index: number // เลขตำแหน่งช่อง
  isLit: boolean // ช่องนี้กำลังสว่างหรือไม่
  isFailed: boolean // ช่องนี้เป็นช่องที่กดผิดหรือไม่
  isCorrect: boolean // ช่องนี้เป็นช่องที่กดถูกหรือไม่
  disabled: boolean // ปิดการกดช่องหรือไม่
  onClick: (i: number) => void // ฟังก์ชันที่จะเรียกเมื่อคลิกช่อง
}

const Cell: React.FC<CellProps> = ({ // component ช่อง 1 ช่องในตาราง
  index, // รับเลขช่อง
  isLit, // รับสถานะสว่าง
  isFailed, // รับสถานะผิด
  isCorrect, // รับสถานะถูก
  disabled, // รับสถานะปิดการกด
  onClick, // รับฟังก์ชันตอนคลิก
}) => { // เริ่ม component Cell
  const bg = isFailed // เลือกสีพื้นหลังตามสถานะของช่อง
    ? 'rgba(220,60,50,0.9)' // ถ้าผิดให้เป็นสีแดง
    : isCorrect // ถ้าไม่ผิด ตรวจว่ากดถูกหรือไม่
      ? 'rgba(255,255,255,0.65)' // ถ้ากดถูกให้เป็นสีขาวจาง
      : isLit // ถ้าไม่ได้กดถูก ตรวจว่ากำลังสว่างหรือไม่
        ? 'rgba(255,255,255,0.95)' // ถ้ากำลังโชว์ให้เป็นสีขาวสว่าง
        : 'rgba(255,255,255,0.18)' // ถ้าปกติให้เป็นสีขาวจางมาก

  return ( // ส่งปุ่มช่องกลับไปแสดงผล
    <button
      aria-label={`cell ${index + 1}`} // ใส่ label สำหรับ accessibility โดยแสดงเลขช่องแบบ 1-9
      disabled={disabled} // ถ้า disabled เป็น true จะกดไม่ได้
      onClick={() => onClick(index)} // กดแล้วส่ง index ของช่องกลับไป
      style={{
        width: '100%', // ให้ปุ่มกว้างเต็มพื้นที่ grid
        aspectRatio: '1', // ทำให้ปุ่มเป็นสี่เหลี่ยมจัตุรัส
        background: bg, // ใช้สีพื้นหลังที่คำนวณไว้
        border: 'none', // ไม่แสดงเส้นขอบ
        borderRadius: 10, // ทำมุมโค้ง
        outline: 'none', // ไม่แสดง outline เริ่มต้น
        cursor: disabled ? 'default' : 'pointer', // ถ้ากดได้ให้ cursor เป็นมือ
        transition: 'background 0.08s ease', // ทำให้สีเปลี่ยนแบบนุ่มนวล
        boxShadow: isLit ? '0 0 0 3px rgba(255,255,255,0.45)' : 'none', // ถ้าช่องสว่างให้มีเงาขอบ
      }}
    />
  )
}

const Grid: React.FC<{ // component ตาราง 3x3
  litCell: number | null // ช่องที่กำลังสว่าง ถ้าไม่มีเป็น null
  failedCell: number | null // ช่องที่กดผิด ถ้าไม่มีเป็น null
  correctCell: number | null // ช่องที่กดถูก ถ้าไม่มีเป็น null
  disabled: boolean // ใช้กำหนดว่าตารางกดได้หรือไม่
  onCellClick: (i: number) => void // ฟังก์ชันเมื่อคลิกช่อง
}> = ({ litCell, failedCell, correctCell, disabled, onCellClick }) => ( // รับ props แล้ว render grid
  <div
    style={{
      display: 'grid', // ใช้ CSS grid
      gridTemplateColumns: 'repeat(3, 1fr)', // แบ่งเป็น 3 คอลัมน์เท่ากัน
      gap: 10, // ระยะห่างระหว่างช่อง
      width: '100%', // กว้างเต็มพื้นที่ที่มี
      maxWidth: 360, // จำกัดความกว้างสูงสุดของตาราง
    }}
  >
    {Array.from({ length: 9 }, (_, i) => ( // สร้างช่อง 9 ช่อง ตั้งแต่ index 0-8
      <Cell
        key={i} // key สำหรับ React list
        index={i} // ส่งเลขช่องไปให้ Cell
        isLit={litCell === i} // ช่องนี้สว่างเมื่อ litCell เท่ากับ i
        isFailed={failedCell === i} // ช่องนี้เป็นช่องผิดเมื่อ failedCell เท่ากับ i
        isCorrect={correctCell === i} // ช่องนี้เป็นช่องถูกเมื่อ correctCell เท่ากับ i
        disabled={disabled} // ส่งสถานะปิดการกดไปให้ Cell
        onClick={onCellClick} // ส่งฟังก์ชันคลิกไปให้ Cell
      />
    ))}
  </div>
)

const SquareIcon: React.FC = () => ( // component ไอคอนสี่เหลี่ยมด้านบนหน้าเกม
  <div
    style={{
      display: 'grid', // ใช้ grid จัดช่องไอคอน
      gridTemplateColumns: '1fr 1fr', // แบ่งเป็น 2 คอลัมน์
      gap: 5, // ระยะห่างระหว่างช่องเล็ก
      width: 52, // ความกว้างไอคอน
      height: 52, // ความสูงไอคอน
    }}
  >
    {[0, 1, 2, 3].map((i) => ( // วนสร้างช่องไอคอน 4 ช่อง
      <div
        key={i} // key ของช่องไอคอน
        style={{
          background: i === 3 ? 'transparent' : 'rgba(255,255,255,0.7)', // ช่องที่ 4 โปร่งใส ที่เหลือเป็นสีขาวจาง
          border: i === 3 ? '2px solid rgba(255,255,255,0.45)' : 'none', // ช่องที่ 4 มีเส้นขอบ
          borderRadius: 5, // ทำมุมโค้งของช่องไอคอน
        }}
      />
    ))}
  </div>
)

// ════════════════════════════════════════════════════════════
// STYLES // ส่วนกำหนด style กลางของหน้า
// ════════════════════════════════════════════════════════════

const FONT = "'DM Sans','Segoe UI',sans-serif" // กำหนด font หลักของหน้า

const wrap: React.CSSProperties = { // style กล่องหลักของทุกหน้าเกม
  minHeight: '100vh', // สูงอย่างน้อยเต็มหน้าจอ
  display: 'flex', // ใช้ flex layout
  flexDirection: 'column', // เรียง element แนวตั้ง
  alignItems: 'center', // จัดกึ่งกลางแนวนอน
  justifyContent: 'center', // จัดกึ่งกลางแนวตั้ง
  padding: '1.5rem 1rem', // ระยะห่างด้านใน
  gap: '1.5rem', // ระยะห่างระหว่าง element ลูก
  background: '#9bd8a5', // สีพื้นหลังเขียว
  fontFamily: FONT, // ใช้ font ที่กำหนดไว้
  color: 'white', // สีตัวอักษรหลักเป็นสีขาว
}

const btnYellow: React.CSSProperties = { // style ปุ่มหลักสีเหลือง
  background: '#f0b429', // สีพื้นหลังปุ่ม
  color: '#412402', // สีตัวอักษรปุ่ม
  border: 'none', // ไม่มีเส้นขอบ
  borderRadius: 8, // มุมโค้ง
  padding: '13px 52px', // ระยะห่างด้านในปุ่ม
  fontSize: 17, // ขนาดตัวอักษร
  fontWeight: 700, // ความหนาตัวอักษร
  cursor: 'pointer', // เมาส์เป็นรูปมือเมื่อชี้
  fontFamily: FONT, // ใช้ font เดียวกับหน้า
}

const btnGhost: React.CSSProperties = { // style ปุ่มรองแบบโปร่งใส
  ...btnYellow, // ใช้ style จากปุ่มเหลืองก่อน
  background: 'transparent', // เปลี่ยนพื้นหลังเป็นโปร่งใส
  color: 'rgba(255,255,255,0.75)', // เปลี่ยนสีตัวอักษรเป็นขาวจาง
  border: '1.5px solid rgba(255,255,255,0.35)', // เพิ่มเส้นขอบขาวจาง
}

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT // component หลักของเกม
// ════════════════════════════════════════════════════════════

export default function SequenceMemory({ // export component หลักออกไปใช้งาน
  playerId = 'test-player', // ค่า default ของ playerId ถ้าไม่ได้ส่งเข้ามา
  sessionId = 'test-session', // ค่า default ของ sessionId ถ้าไม่ได้ส่งเข้ามา
  onGameComplete = () => {}, // ค่า default ของ callback ถ้าไม่ได้ส่งเข้ามา
}: GameProps) { // ระบุว่า props ต้องตรงกับ GameProps
  const [state, dispatch] = useReducer(reducer, initial) // ใช้ reducer จัดการ state เกมหลัก
  const [litCell, setLit] = useState<number | null>(null) // state เก็บช่องที่กำลังสว่าง
  const [failedCell, setFail] = useState<number | null>(null) // state เก็บช่องที่กดผิด
  const [correctCell, setCor] = useState<number | null>(null) // state เก็บช่องที่กดถูกล่าสุด

  const startPerfRef = useRef<number>(0) // ref เก็บเวลาเริ่มเกมจาก performance.now()
  const startIsoRef = useRef<string>('') // ref เก็บเวลาเริ่มเกมแบบ ISO string

  const inputRef = useRef<number[]>([]) // ref เก็บ input ล่าสุดของผู้เล่น เพื่อใช้ใน callback
  const seqRef = useRef<number[]>([]) // ref เก็บ sequence ล่าสุด เพื่อใช้ตรวจคำตอบ
  const seqsRef = useRef<number[][]>([]) // ref เก็บ sequence ที่ผ่านแล้วล่าสุด

  const inputStartRef = useRef<number>(0) // ref เก็บเวลาเริ่มให้ผู้เล่นกด ใช้วัด reaction time
  const mistakesRef = useRef<number>(0) // ref เก็บจำนวนครั้งที่กดผิด
  const correctClicksRef = useRef<number>(0) // ref เก็บจำนวนคลิกที่ถูก
  const totalClicksRef = useRef<number>(0) // ref เก็บจำนวนคลิกทั้งหมด
  const reactionTimesRef = useRef<number[]>([]) // ref เก็บ reaction time ทุกครั้ง

  useEffect(() => { // sync playerInput จาก state ไปเก็บใน ref
    inputRef.current = state.playerInput // อัปเดต inputRef ให้เป็น input ล่าสุด
  }, [state.playerInput]) // ทำงานเมื่อ playerInput เปลี่ยน

  useEffect(() => { // sync sequence จาก state ไปเก็บใน ref
    seqRef.current = state.sequence // อัปเดต seqRef ให้เป็น sequence ล่าสุด
  }, [state.sequence]) // ทำงานเมื่อ sequence เปลี่ยน

  useEffect(() => { // sync sequences จาก state ไปเก็บใน ref
    seqsRef.current = state.sequences // อัปเดต seqsRef ให้เป็นประวัติ sequence ล่าสุด
  }, [state.sequences]) // ทำงานเมื่อ sequences เปลี่ยน

  const handleStart = () => { // ฟังก์ชันเริ่มเกมใหม่
    startPerfRef.current = performance.now() // บันทึกเวลาเริ่มแบบละเอียดสำหรับคำนวณ duration
    startIsoRef.current = new Date().toISOString() // บันทึกเวลาเริ่มแบบ ISO สำหรับส่งผลลัพธ์

    inputStartRef.current = 0 // รีเซ็ตเวลาเริ่ม input
    mistakesRef.current = 0 // รีเซ็ตจำนวนครั้งที่ผิด
    correctClicksRef.current = 0 // รีเซ็ตจำนวนคลิกถูก
    totalClicksRef.current = 0 // รีเซ็ตจำนวนคลิกทั้งหมด
    reactionTimesRef.current = [] // รีเซ็ต reaction time

    setFail(null) // ล้างช่องผิด
    setCor(null) // ล้างช่องถูก
    setLit(null) // ล้างช่องสว่าง
    dispatch({ type: 'START' }) // ส่ง action START เพื่อเริ่มเกม
  }

  useEffect(() => { // effect สำหรับเล่น animation โชว์ sequence
    if (state.phase !== 'showing') return // ถ้าไม่ได้อยู่โหมดโชว์ลำดับ ไม่ต้องทำอะไร

    let cancelled = false // ตัวแปรใช้ยกเลิก animation ถ้า component เปลี่ยน state หรือ unmount

    const play = async () => { // ฟังก์ชัน async สำหรับโชว์ไฟทีละช่อง
      const speedLevel = getSpeedLevel(state.level) // คำนวณระดับความเร็วจากเลเวลปัจจุบัน ทุกครบ 5 เลเวลจะเพิ่ม 1 ระดับ
      const flashOnTime = getFlashOnTime(speedLevel) // คำนวณเวลาที่ไฟติดตามระดับความเร็ว
      const flashOffTime = getFlashOffTime(speedLevel) // คำนวณเวลาพักระหว่างไฟตามระดับความเร็ว

      await sleep(600) // รอก่อนเริ่มโชว์ sequence

      for (let i = 0; i < state.sequence.length; i++) { // วนตามจำนวนช่องใน sequence
        if (cancelled) return // ถ้าถูกยกเลิกให้ออกจากฟังก์ชัน

        setLit(state.sequence[i]) // เปิดไฟช่องตามลำดับปัจจุบัน
        await sleep(flashOnTime) // รอให้ช่องสว่างตามความเร็วปัจจุบัน

        if (cancelled) return // ตรวจอีกครั้งว่าถูกยกเลิกหรือไม่

        setLit(null) // ปิดไฟช่องปัจจุบัน

        if (i < state.sequence.length - 1) { // ถ้ายังไม่ใช่ช่องสุดท้าย
          await sleep(flashOffTime) // เว้นช่วงก่อนโชว์ช่องถัดไปตามความเร็วปัจจุบัน
        }
      }

      await sleep(400) // รอเล็กน้อยหลังโชว์ครบ

      if (!cancelled) { // ถ้ายังไม่ถูกยกเลิก
        inputStartRef.current = performance.now() // บันทึกเวลาเริ่มให้ผู้เล่นกด
        dispatch({ type: 'BEGIN_INPUT' }) // เปลี่ยน state เป็นโหมด input
      }
    }

    play() // เรียกเล่น animation

    return () => { // cleanup เมื่อ effect ถูกยกเลิกหรือรันใหม่
      cancelled = true // ตั้งค่าว่ายกเลิกแล้ว
      setLit(null) // ปิดไฟช่องที่อาจค้างอยู่
    }
  }, [state.phase, state.sequence]) // effect นี้ทำงานเมื่อ phase หรือ sequence เปลี่ยน

  const handleCellClick = useCallback( // memoize ฟังก์ชันคลิกช่องเพื่อไม่ให้สร้างใหม่ทุก render โดยไม่จำเป็น
    (cellIndex: number) => { // รับเลขช่องที่ผู้เล่นกด
      if (state.phase !== 'input') return // ถ้าไม่ใช่โหมด input จะไม่ให้กด

      totalClicksRef.current += 1 // เพิ่มจำนวนคลิกทั้งหมด

      if (inputStartRef.current > 0) { // ถ้ามีเวลาเริ่ม input แล้ว
        reactionTimesRef.current.push( // เก็บ reaction time ของการกดครั้งนี้
          Math.round(performance.now() - inputStartRef.current) // เวลาปัจจุบันลบเวลาเริ่ม input แล้วปัดเศษ
        )
      }

      const result = checkInput(seqRef.current, inputRef.current, cellIndex) // ตรวจว่าช่องที่กดถูก ผิด หรือครบ sequence

      if (result === 'wrong') { // ถ้ากดผิด
        mistakesRef.current += 1 // เพิ่มจำนวนครั้งที่ผิด
        setFail(cellIndex) // ทำให้ช่องที่กดผิดแสดงสีผิด

        setTimeout(() => { // หน่วงเวลาให้เห็นสีผิดก่อนเปลี่ยนหน้า
          dispatch({ type: 'FAIL' }) // เปลี่ยนเป็นหน้า result
          setFail(null) // ล้างช่องผิด

          const gameResult = buildGameResult({ // สร้าง object ผลลัพธ์ของเกม
            playerId, // ส่งรหัสผู้เล่น
            sessionId, // ส่งรหัส session
            level: state.level, // ส่งเลเวลปัจจุบัน
            startedAt: startPerfRef.current, // ส่งเวลาเริ่มเกม
            endedAt: performance.now(), // ส่งเวลาจบเกม
            startIso: startIsoRef.current, // ส่งเวลาเริ่มแบบ ISO
            sequences: [...seqsRef.current, seqRef.current], // รวม sequence ที่ผ่านแล้วกับ sequence ปัจจุบัน
            mistakes: mistakesRef.current, // ส่งจำนวนครั้งที่ผิด
            correctClicks: correctClicksRef.current, // ส่งจำนวนคลิกถูก
            totalClicks: totalClicksRef.current, // ส่งจำนวนคลิกทั้งหมด
            reactionTimesMs: reactionTimesRef.current, // ส่ง reaction time ทั้งหมด
            speedLevel: getSpeedLevel(state.level), // ส่งระดับความเร็วตอนจบเกม
          })

          onGameComplete(gameResult) // เรียก callback เพื่อส่งผลลัพธ์ออกไปนอก component
        }, 600) // รอ 600 ms ก่อนจบเกม

        return // หยุดทำงานต่อ เพราะเกมจบแล้ว
      }

      correctClicksRef.current += 1 // ถ้าไม่ผิด แปลว่ากดถูก จึงเพิ่มจำนวนคลิกถูก

      setCor(cellIndex) // ทำให้ช่องที่กดถูกแสดง feedback
      setTimeout(() => setCor(null), 180) // ล้าง feedback ช่องถูกหลัง 180 ms

      dispatch({ type: 'PLAYER_PRESS', cell: cellIndex }) // บันทึกช่องที่ผู้เล่นกดลง state

      if (result === 'complete') { // ถ้ากดครบ sequence ของเลเวลนี้แล้ว
        setTimeout(() => dispatch({ type: 'NEXT_LEVEL' }), 800) // รอแล้วไปเลเวลถัดไป
      }
    },
    [state.phase, state.level, playerId, sessionId, onGameComplete] // dependency ที่ทำให้ useCallback อัปเดตเมื่อค่าเหล่านี้เปลี่ยน
  )

  if (state.phase === 'idle') { // ถ้าเกมยังไม่เริ่ม ให้แสดงหน้าเริ่มเกม
    return ( // คืน JSX หน้าเริ่มเกม
      <div style={wrap}>
        <SquareIcon /> {/* แสดงไอคอนด้านบน */}
        <h1
          style={{
            fontSize: 36, // ขนาดหัวข้อ
            fontWeight: 700, // ความหนาหัวข้อ
            textAlign: 'center', // จัดหัวข้อกึ่งกลาง
            lineHeight: 1.2, // ระยะห่างบรรทัด
          }}
        >
          Sequence Memory Test {/* ชื่อเกม */}
        </h1>
        <p style={{ fontSize: 16, opacity: 0.85 }}>Memorize the pattern.</p> {/* ข้อความอธิบายสั้น ๆ */}
        <button style={btnYellow} onClick={handleStart}>
          Start {/* กดแล้วเริ่มเกม */}
        </button>
      </div>
    )
  }

  if (state.phase === 'result') { // ถ้าเกมจบแล้ว ให้แสดงหน้าผลลัพธ์
    const passed = Math.max(state.level - 1, 0) // คำนวณเลเวลที่ผ่านได้จริง

    return ( // คืน JSX หน้าผลลัพธ์
      <div style={wrap}>
        <SquareIcon /> {/* แสดงไอคอนด้านบน */}
        <h2 style={{ fontSize: 22, fontWeight: 500 }}>You reached level</h2> {/* ข้อความบอกว่าผู้เล่นถึงเลเวลไหน */}
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1 }}>
          {passed} {/* แสดงเลเวลที่ผ่านได้ */}
        </div>
        <p
          style={{
            fontSize: 15, // ขนาดข้อความสรุป
            opacity: 0.75, // ความโปร่งใสของข้อความ
            textAlign: 'center', // จัดข้อความกึ่งกลาง
            maxWidth: 280, // จำกัดความกว้างของข้อความ
          }}
        >
          Passed <strong>{passed}</strong> level{passed === 1 ? '' : 's'} &nbsp;|&nbsp; Score:{' '} {/* แสดงจำนวนระดับที่ผ่านและคะแนนเป็นภาษาอังกฤษ */}
          <strong>{passed * 10}</strong> {/* แสดงคะแนน */}
        </p>
        <button style={btnYellow} onClick={handleStart}>
          Try again {/* กดแล้วเริ่มเล่นใหม่ */}
        </button>
        <button style={btnGhost} onClick={() => dispatch({ type: 'RESET' })}>
          Back {/* กดแล้วกลับหน้าเริ่มต้น */}
        </button>
      </div>
    )
  }

  const remaining = state.sequence.length - state.playerInput.length // คำนวณจำนวนช่องที่ยังต้องกดให้ครบ
  const status = // ข้อความสถานะด้านล่างตาราง
    state.phase === 'showing' // ถ้ากำลังโชว์ sequence
      ? 'Watch the pattern...' // แสดงให้ดู pattern
      : `Repeat the pattern — ${remaining} left` // ถ้าให้ผู้เล่นกด แสดงจำนวนที่เหลือ
  return ( // คืน JSX หน้าเล่นเกม
    <div style={wrap}>
      <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: 1 }}>
        Level:{' '} {/* label แสดงเลเวล */}
        <span style={{ fontSize: 28, fontWeight: 700, color: '#f0e14a' }}>
          {state.level} {/* แสดงเลขเลเวลปัจจุบัน */}
        </span>
      </div>

      <Grid
        litCell={litCell} // ส่งช่องที่กำลังสว่างไปให้ Grid
        failedCell={failedCell} // ส่งช่องที่กดผิดไปให้ Grid
        correctCell={correctCell} // ส่งช่องที่กดถูกไปให้ Grid
        disabled={state.phase !== 'input'} // ถ้าไม่ใช่ช่วง input จะปิดการกดช่อง
        onCellClick={handleCellClick} // ส่งฟังก์ชันคลิกช่องไปให้ Grid
      />

      <p style={{ fontSize: 15, opacity: 0.8, minHeight: 22 }}>{status}</p> {/* แสดงข้อความสถานะของเกม */}
    </div>
  )
}
