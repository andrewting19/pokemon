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
export const LAST_ROM_STORAGE_KEY = 'pokemon:last-rom'
export const BUNDLED_ROM_URL = 'https://pub-96d84523d8a341b79c022b2a33f1c324.r2.dev/pokemon-platinum.nds.gz'
export const BUNDLED_ROM_NAME = 'pokemon-platinum.nds'

let runtimeScriptsPromise: Promise<void> | null = null

export function getWebMelon(): WebMelonInterface {
  if (!window.WebMelon) {
    throw new Error('The Nintendo DS runtime did not load.')
  }

  return window.WebMelon
}

export function ensureWebMelonRuntime(): Promise<void> {
  const runtimeWindow = window as Window & { Module?: unknown }
  if (window.WebMelon && runtimeWindow.Module) {
    return Promise.resolve()
  }

  if (runtimeScriptsPromise) {
    return runtimeScriptsPromise
  }

  runtimeScriptsPromise = (async () => {
    // webmelon.js must load first: it sets window.Module with an
    // onRuntimeInitialized callback.  wasmemulator.js (Emscripten output)
    // snapshots whatever Module object exists at parse time, so the callback
    // must already be in place before the Emscripten script executes.
    await loadRuntimeScript('static/webmelon.js', 'webmelon')
    await loadRuntimeScript('static/wasmemulator.js', 'wasmemulator')
  })().catch((error) => {
    runtimeScriptsPromise = null
    throw error
  })

  return runtimeScriptsPromise
}

function loadRuntimeScript(relativePath: string, key: string): Promise<void> {
  const runtimeWindow = window as Window & { Module?: unknown }
  const existing = document.querySelector<HTMLScriptElement>(`script[data-runtime-script="${key}"]`)
  if (existing) {
    if ((key === 'wasmemulator' && runtimeWindow.Module) || (key === 'webmelon' && window.WebMelon)) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Could not load ${relativePath}.`)), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${import.meta.env.BASE_URL}${relativePath}`.replace(/\/{2,}/g, '/')
    script.async = false
    script.dataset.runtimeScript = key
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Could not load ${relativePath}.`))
    document.body.appendChild(script)
  })
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
  if (!window.WebMelon?._internal) {
    return
  }

  const wm = getWebMelon()
  wm._internal.emulatorButtonInput |= wm.constants.DS_INPUT_MAP[button]
}

export function releaseButton(button: DsButton): void {
  if (!window.WebMelon?._internal) {
    return
  }

  const wm = getWebMelon()
  wm._internal.emulatorButtonInput &= ~wm.constants.DS_INPUT_MAP[button] & 0xfff
}

export function releaseAllButtons(): void {
  if (!window.WebMelon?._internal) {
    return
  }

  const wm = getWebMelon()
  wm._internal.emulatorButtonInput = 0
}

const ROM_CACHE_DB = 'platinum-web-rom-cache'
const ROM_CACHE_STORE = 'roms'
const ROM_CACHE_KEY = 'bundled-platinum'

function openRomCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ROM_CACHE_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ROM_CACHE_STORE)) {
        db.createObjectStore(ROM_CACHE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getCachedBundledRom(): Promise<Uint8Array | null> {
  try {
    const db = await openRomCacheDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ROM_CACHE_STORE, 'readonly')
      const store = tx.objectStore(ROM_CACHE_STORE)
      const request = store.get(ROM_CACHE_KEY)
      request.onsuccess = () => {
        const result = request.result
        if (result instanceof Blob) {
          result.arrayBuffer().then(
            (buf) => resolve(new Uint8Array(buf)),
            () => resolve(null),
          )
        } else if (result instanceof Uint8Array) {
          resolve(result)
        } else if (result instanceof ArrayBuffer) {
          resolve(new Uint8Array(result))
        } else {
          resolve(null)
        }
      }
      request.onerror = () => reject(request.error)
    })
  } catch {
    return null
  }
}

async function cacheBundledRom(data: Uint8Array): Promise<void> {
  try {
    const db = await openRomCacheDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROM_CACHE_STORE, 'readwrite')
      const store = tx.objectStore(ROM_CACHE_STORE)
      store.put(new Blob([data.buffer as ArrayBuffer]), ROM_CACHE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Non-critical — next launch will just re-download.
  }
}

export async function fetchBundledRomBuffer({
  onProgress,
  onStatus,
}: {
  onProgress?: (progress: number | null) => void
  onStatus?: (message: string) => void
} = {}): Promise<Uint8Array> {
  onStatus?.('Checking for cached ROM...')

  const cached = await getCachedBundledRom()
  if (cached && cached.byteLength > 0 && looksLikeNintendoDsRom(cached)) {
    onStatus?.('Loaded ROM from device cache.')
    return cached
  }

  onStatus?.('Downloading Pokemon Platinum...')
  onProgress?.(0)

  const response = await fetch(BUNDLED_ROM_URL, { cache: 'no-store' })
  if (!response.ok) {
    onProgress?.(null)
    throw new Error(`Download failed (${response.status})`)
  }

  const contentLength = Number(response.headers.get('Content-Length') || 0)
  const reader = response.body?.getReader()
  if (!reader) {
    onProgress?.(null)
    throw new Error('Download stream unavailable')
  }

  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    chunks.push(value)
    received += value.byteLength

    if (contentLength > 0) {
      onProgress?.(Math.round((received / contentLength) * 100))
    }
  }

  onStatus?.('Decompressing ROM...')
  onProgress?.(null)

  const compressed = new Blob(chunks as BlobPart[])
  const ds = new DecompressionStream('gzip')
  const decompressed = compressed.stream().pipeThrough(ds)
  const decompressedBlob = await new Response(decompressed).blob()
  const romData = new Uint8Array(await decompressedBlob.arrayBuffer())

  void cacheBundledRom(romData)

  return romData
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
