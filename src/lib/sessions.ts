import {
  clearRememberedRom,
  deriveRomPath,
  deriveSavePath,
  loadRememberedRom,
} from './emulator'

const SESSIONS_STORAGE_KEY = 'pokemon:sessions'

export interface GameSession {
  id: string
  name: string
  fileName: string
  fileSize: number
  romPath: string
  savePath: string
  sourceLabel: string
  createdAt: string
  lastPlayedAt: string
}

export function loadSessions(): GameSession[] {
  const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (entry): entry is GameSession =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.romPath === 'string',
    )
  } catch {
    return []
  }
}

function persistSessions(sessions: GameSession[]): void {
  window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
}

export function saveSession(session: GameSession): void {
  const sessions = loadSessions()
  const index = sessions.findIndex((s) => s.id === session.id)

  if (index >= 0) {
    sessions[index] = { ...sessions[index], ...session, lastPlayedAt: new Date().toISOString() }
  } else {
    sessions.unshift(session)
  }

  persistSessions(sessions)
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id)
  persistSessions(sessions)
}

export function findSession(id: string): GameSession | null {
  return loadSessions().find((s) => s.id === id) ?? null
}

export function touchSession(id: string): void {
  const sessions = loadSessions()
  const index = sessions.findIndex((s) => s.id === id)
  if (index < 0) {
    return
  }

  sessions[index].lastPlayedAt = new Date().toISOString()

  // Move to front of list
  const [session] = sessions.splice(index, 1)
  sessions.unshift(session)
  persistSessions(sessions)
}

export function migrateRememberedRom(): void {
  const sessions = loadSessions()
  if (sessions.length > 0) {
    return
  }

  const remembered = loadRememberedRom()
  if (!remembered) {
    return
  }

  const now = new Date().toISOString()
  const session: GameSession = {
    id: remembered.romPath,
    name: generateSessionName('Cached ROM', []),
    fileName: remembered.fileName,
    fileSize: remembered.fileSize,
    romPath: remembered.romPath,
    savePath: deriveSavePath(remembered.fileName),
    sourceLabel: 'Cached ROM',
    createdAt: now,
    lastPlayedAt: now,
  }

  persistSessions([session])
  clearRememberedRom()
}

export function createSession(
  fileName: string,
  fileSize: number,
  sourceLabel: string,
): GameSession {
  const now = new Date().toISOString()
  const romPath = deriveRomPath(fileName)
  const sessions = loadSessions()

  // Check if a session with this romPath already exists
  const existing = sessions.find((s) => s.id === romPath)
  if (existing) {
    existing.lastPlayedAt = now
    persistSessions(sessions)
    return existing
  }

  const session: GameSession = {
    id: romPath,
    name: generateSessionName(sourceLabel, sessions),
    fileName,
    fileSize,
    romPath,
    savePath: deriveSavePath(fileName),
    sourceLabel,
    createdAt: now,
    lastPlayedAt: now,
  }

  saveSession(session)
  return session
}

export function generateSessionName(sourceLabel: string, existingSessions: GameSession[]): string {
  let baseName: string

  if (sourceLabel === 'Bundled Pokemon Platinum') {
    baseName = 'Vanilla Platinum'
  } else if (sourceLabel === 'Custom Randomizer') {
    baseName = 'Randomized Run'
  } else if (sourceLabel === 'Imported ROM') {
    baseName = 'Imported Run'
  } else {
    baseName = sourceLabel || 'Run'
  }

  // Check for duplicates and add a number if needed
  const existingNames = new Set(existingSessions.map((s) => s.name))
  if (!existingNames.has(baseName)) {
    return baseName
  }

  let counter = 2
  while (existingNames.has(`${baseName} #${counter}`)) {
    counter += 1
  }

  return `${baseName} #${counter}`
}

export function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then

  if (diffMs < 0) {
    return 'just now'
  }

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) {
    return 'just now'
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  if (days === 1) {
    return 'yesterday'
  }

  if (days < 30) {
    return `${days}d ago`
  }

  return new Date(isoString).toLocaleDateString()
}
