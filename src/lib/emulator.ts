export type DsButton =
  | 'A'
  | 'B'
  | 'SELECT'
  | 'START'
  | 'DPAD_RIGHT'
  | 'DPAD_LEFT'
  | 'DPAD_UP'
  | 'DPAD_DOWN'
  | 'R'
  | 'L'
  | 'X'
  | 'Y'

export interface RuntimeStatus {
  sdkReady: boolean
  storageReady: boolean
  saveMessage: string
  errorMessage: string | null
}

export interface RememberedRom {
  fileName: string
  fileSize: number
  romPath: string
}

export const ROM_DIRECTORY = '/roms'
export const SAVE_DIRECTORY = '/savefiles'
export const LAST_ROM_STORAGE_KEY = 'platinum-web:last-rom'

export function getWebMelon(): WebMelonInterface {
  if (!window.WebMelon) {
    throw new Error('The Nintendo DS runtime did not load.')
  }

  return window.WebMelon
}

export function sanitizeStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'session'
}

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function deriveSavePath(romName: string): string {
  return `${SAVE_DIRECTORY}/${sanitizeStem(romName)}.sav`
}

export function deriveRomPath(romName: string): string {
  return `${ROM_DIRECTORY}/${sanitizeStem(romName)}.nds`
}

export function looksLikeNintendoDsRom(data: Uint8Array): boolean {
  if (data.byteLength < 0x200) {
    return false
  }

  const decoder = new TextDecoder('ascii')
  const gameCode = decoder.decode(data.slice(0x0c, 0x10)).trim()
  const makerCode = decoder.decode(data.slice(0x10, 0x12)).trim()
  const arm9Offset = readUint32(data, 0x20)
  const arm7Offset = readUint32(data, 0x30)

  const plausibleCode = /^[A-Z0-9]{4}$/.test(gameCode)
  const plausibleMaker = /^[A-Z0-9]{2}$/.test(makerCode)
  const validArm9Offset = arm9Offset >= 0x200 && arm9Offset < data.byteLength
  const validArm7Offset = arm7Offset >= 0x200 && arm7Offset < data.byteLength

  return plausibleCode && plausibleMaker && validArm9Offset && validArm7Offset
}

export function ensureBaseDirectories(): void {
  const wm = getWebMelon()
  wm.storage.createDirectory(ROM_DIRECTORY)
}

export async function prepareStorage(): Promise<void> {
  await syncStorage(true)
}

export async function syncStorage(populate = false): Promise<void> {
  if (!window.FS || !window.IDBFS) {
    throw new Error('Browser filesystem helpers are unavailable.')
  }

  const dirs = ['/firmware', SAVE_DIRECTORY, ROM_DIRECTORY]
  for (const dir of dirs) {
    if (!window.FS.analyzePath(dir).exists) {
      window.FS.mkdir(dir)
      window.FS.mount(window.IDBFS, {}, dir)
    }
  }

  await new Promise<void>((resolve, reject) => {
    window.FS?.syncfs(populate, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

export function isRuntimeLoaded(): boolean {
  return Boolean(window.WebMelon?._internal?.wasmLoaded)
}

export function resumeAudioContext(): Promise<void> | void {
  try {
    return getWebMelon().audio.getAudioContext().resume()
  } catch {
    return undefined
  }
}

export function pressButton(button: DsButton): void {
  const wm = getWebMelon()
  wm._internal.emulatorButtonInput |= wm.constants.DS_INPUT_MAP[button]
}

export function releaseButton(button: DsButton): void {
  const wm = getWebMelon()
  wm._internal.emulatorButtonInput &= ~wm.constants.DS_INPUT_MAP[button] & 0xfff
}

export function releaseAllButtons(): void {
  const wm = getWebMelon()
  wm._internal.emulatorButtonInput = 0
}

export function saveFileExists(path: string): boolean {
  return Boolean(window.FS?.analyzePath(path).exists)
}

export function readVirtualFile(path: string): Uint8Array {
  if (!window.FS) {
    throw new Error('The virtual filesystem is unavailable.')
  }

  return window.FS.readFile(path)
}

export function writeVirtualFile(path: string, data: Uint8Array): void {
  if (!window.FS) {
    throw new Error('The virtual filesystem is unavailable.')
  }

  window.FS.writeFile(path, data)
}

export function deleteVirtualFile(path: string): void {
  if (!window.FS) {
    throw new Error('The virtual filesystem is unavailable.')
  }

  if (!window.FS.analyzePath(path).exists) {
    return
  }

  window.FS.unlink(path)
}

export function loadRememberedRom(): RememberedRom | null {
  const raw = window.localStorage.getItem(LAST_ROM_STORAGE_KEY)

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as RememberedRom
    if (!parsed.fileName || !parsed.romPath || typeof parsed.fileSize !== 'number') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveRememberedRom(rememberedRom: RememberedRom): void {
  window.localStorage.setItem(LAST_ROM_STORAGE_KEY, JSON.stringify(rememberedRom))
}

export function clearRememberedRom(): void {
  window.localStorage.removeItem(LAST_ROM_STORAGE_KEY)
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0
}
