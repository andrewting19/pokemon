const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/2.3/loader.js'
const RANDOMIZER_DEBUG_KEY = 'pokemon:randomizer-debug'
const EMULATOR_HEAP_GLOBAL_KEYS = [
  'HEAP8',
  'HEAP16',
  'HEAP32',
  'HEAP64',
  'HEAPU8',
  'HEAPU16',
  'HEAPU32',
  'HEAPU64',
  'HEAPF32',
  'HEAPF64',
] as const

export type RandomizerPresetId = 'classic' | 'balanced' | 'chaos'

export interface RandomizerPreset {
  id: RandomizerPresetId
  label: string
  description: string
  settingsPath: string
}

export const RANDOMIZER_PRESETS: RandomizerPreset[] = [
  {
    id: 'classic',
    label: 'Classic Randomizer',
    description: 'Random starters, wilds, trainers, and statics without the full chaos stack.',
    settingsPath: 'randomizer/settings/classic.rnqs',
  },
  {
    id: 'balanced',
    label: 'Balanced Randomizer',
    description: 'A steadier preset with more guardrails than classic while still reshuffling the run.',
    settingsPath: 'randomizer/settings/balanced.rnqs',
  },
  {
    id: 'chaos',
    label: 'Chaos Randomizer',
    description: 'The loud upstream race preset with far less balance protection.',
    settingsPath: 'randomizer/settings/chaos.rnqs',
  },
]

function getRandomizerJarUrl(): string {
  return `${import.meta.env.BASE_URL.replace(/^\//, '')}randomizer/dist/randomizer.jar`
}

declare global {
  interface Window {
    cheerpjInit?: () => Promise<void>
    cheerpjCreateDisplay?: (width: number, height: number, element?: Element) => Promise<void> | void
    cheerpjRunJar?: (path: string, ...args: string[]) => Promise<void> | void
    cheerpjAddStringFile?: (path: string, data: Uint8Array) => void
    cjFileBlob?: (path: string) => Promise<Blob | null>
    cjNew?: (className: string, ...args: unknown[]) => Promise<unknown>
    cjCall?: (instance: unknown, methodName: string, ...args: unknown[]) => Promise<unknown>
  }
}

let loaderPromise: Promise<void> | null = null
let runtimePromise: Promise<void> | null = null
let emulatorHeapGlobalsSnapshot: Partial<Record<(typeof EMULATOR_HEAP_GLOBAL_KEYS)[number], unknown>> | null = null

interface RandomizerDebugState {
  startedAt: string
  updatedAt: string
  phase: string
  currentStep: string
  completedSteps: string[]
  error: string | null
  preset: RandomizerPresetId
  romName: string
  romBytes: number
  telemetry: {
    moduleHeap8Length: number | null
    windowHeap8Length: number | null
    jsHeapLimit: number | null
    usedJsHeapSize: number | null
    totalJsHeapSize: number | null
  }
}

export async function randomizeRom({
  romData,
  romName,
  preset,
  onStatus,
}: {
  romData: Uint8Array
  romName: string
  preset: RandomizerPresetId
  onStatus?: (message: string) => void
}): Promise<{ fileName: string; fileData: Uint8Array; presetLabel: string }> {
  try {
    const presetConfig = RANDOMIZER_PRESETS.find((option) => option.id === preset)
    if (!presetConfig) {
      throw new Error('Unknown randomizer preset.')
    }

    const debug = createRandomizerDebugState({
      preset,
      romName,
      romBytes: romData.byteLength,
    })

    onStatus?.('Preparing the browser randomizer...')
    await runRandomizerStep(debug, 'ensure-runtime-ready', () => ensureRuntimeReady())
    await runRandomizerStep(debug, 'clear-randomizer-storage', () => clearRandomizerStorage())

    if (!window.cheerpjAddStringFile || !window.cjNew || !window.cjCall || !window.cjFileBlob) {
      throw new Error('The browser randomizer API did not initialize correctly.')
    }

    const sourceFileName = buildSourceFileName(romName)
    const outputFileName = buildOutputFileName(romName, preset)
    const mountedSourcePath = `/str/${sourceFileName}`
    const workingSourcePath = `/files/${sourceFileName}`
    const outputPath = `/files/${outputFileName}`
    const settingsPath = `/str/settings/${presetConfig.id}.rnqs`

    onStatus?.(`Applying ${presetConfig.label}...`)
    onStatus?.('Loading preset settings...')
    const settingsBytes = await runRandomizerStep(debug, 'fetch-preset-settings', () =>
      loadPresetSettings(presetConfig.settingsPath),
    )
    await runRandomizerStep(debug, 'mount-preset-settings', () => {
      window.cheerpjAddStringFile?.(settingsPath, settingsBytes)
    })
    await runRandomizerStep(debug, 'mount-source-rom', () => {
      window.cheerpjAddStringFile?.(mountedSourcePath, romData)
    })

    const settingsStream = await runRandomizerStep(debug, 'open-settings-file-stream', () =>
      window.cjNew!('java.io.FileInputStream', settingsPath),
    )
    const javaSettings = await runRandomizerStep(debug, 'read-settings', () =>
      window.cjCall!('com.dabomstew.pkrandom.Settings', 'read', settingsStream),
    )
    const customNames = await runRandomizerStep(debug, 'load-custom-names', () =>
      window.cjCall!('com.dabomstew.pkrandom.FileFunctions', 'getCustomNames'),
    )
    await runRandomizerStep(debug, 'apply-custom-names', () =>
      window.cjCall!(javaSettings, 'setCustomNames', customNames),
    )

    onStatus?.('Preparing Java randomizer state...')
    const sourceBytes = await runRandomizerStep(debug, 'read-source-rom-buffer', () =>
      window.cjCall!('com.dabomstew.pkrandom.FileFunctions', 'readFileFullyIntoBuffer', mountedSourcePath),
    )
    await runRandomizerStep(debug, 'write-source-rom-file', () =>
      window.cjCall!('com.dabomstew.pkrandom.FileFunctions', 'writeBytesToFile', workingSourcePath, sourceBytes),
    )
    const javaRandom = await runRandomizerStep(debug, 'create-java-random', () =>
      window.cjNew!('java.util.Random'),
    )
    const romHandler = await runRandomizerStep(debug, 'create-gen4-rom-handler', () =>
      window.cjNew!('com.dabomstew.pkrandom.romhandlers.Gen4RomHandler', javaRandom),
    )
    onStatus?.('Loading the Platinum ROM into the randomizer...')
    await runRandomizerStep(debug, 'load-rom-into-randomizer', () =>
      window.cjCall!(romHandler, 'loadRom', workingSourcePath),
    )

    onStatus?.('Tweaking preset compatibility for Platinum...')
    await runRandomizerStep(debug, 'tweak-settings-for-rom', () =>
      window.cjCall!(javaSettings, 'tweakForRom', romHandler),
    )
    onStatus?.('Creating the randomizer session...')
    const randomizer = await runRandomizerStep(debug, 'create-randomizer-session', () =>
      window.cjNew!('com.dabomstew.pkrandom.Randomizer', javaSettings, romHandler),
    )

    onStatus?.('Generating a fresh randomized Platinum ROM...')
    await runRandomizerStep(
      debug,
      'generate-randomized-rom',
      () => window.cjCall!(randomizer, 'randomize', outputPath),
      240000,
    )

    const fileBlob = await runRandomizerStep(debug, 'read-randomized-rom-output', () =>
      waitForRandomizedFile(outputPath),
    )
    const fileData = new Uint8Array(await fileBlob.arrayBuffer())
    completeRandomizerDebugState(debug)

    return {
      fileName: outputFileName,
      fileData,
      presetLabel: presetConfig.label,
    }
  } catch (error) {
    recordRandomizerError(error)
    throw error
  } finally {
    restoreEmulatorHeapGlobals()
  }
}

function buildSourceFileName(romName: string): string {
  return `${romName.replace(/\.nds$/i, '')}-source.nds`
}

function buildOutputFileName(romName: string, preset: RandomizerPresetId): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${romName.replace(/\.nds$/i, '')}-${preset}-${stamp}.nds`
}

function injectLoaderScript(): Promise<void> {
  if (loaderPromise) {
    return loaderPromise
  }

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cheerpj-loader="true"]')
    if (existing) {
      if (window.cheerpjInit) {
        resolve()
        return
      }

      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Could not load the browser randomizer runtime.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = CHEERPJ_LOADER_URL
    script.async = true
    script.dataset.cheerpjLoader = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the browser randomizer runtime.'))
    document.head.appendChild(script)
  })

  return loaderPromise
}

async function ensureRuntimeReady(): Promise<void> {
  if (runtimePromise) {
    return runtimePromise
  }

  runtimePromise = (async () => {
    captureEmulatorHeapGlobals()

    try {
      await injectLoaderScript()

      if (!window.cheerpjInit || !window.cheerpjCreateDisplay || !window.cheerpjRunJar) {
        throw new Error('The browser randomizer runtime is unavailable.')
      }

      await window.cheerpjInit()

      let host = document.getElementById('randomizer-runtime')
      if (!host) {
        host = document.createElement('div')
        host.id = 'randomizer-runtime'
        host.setAttribute('aria-hidden', 'true')
        host.style.position = 'fixed'
        host.style.width = '1px'
        host.style.height = '1px'
        host.style.overflow = 'hidden'
        host.style.opacity = '0'
        host.style.pointerEvents = 'none'
        host.style.bottom = '0'
        host.style.left = '0'
        document.body.appendChild(host)
        await window.cheerpjCreateDisplay(1, 1, host)
        await window.cheerpjRunJar(getRandomizerJarUrl(), '--noupdate')
      }

      await waitForClassAvailability()
    } finally {
      restoreEmulatorHeapGlobals()
    }
  })()

  return runtimePromise
}

function captureEmulatorHeapGlobals(): void {
  if (emulatorHeapGlobalsSnapshot) {
    return
  }

  const globalWindow = window as unknown as Record<string, unknown>
  emulatorHeapGlobalsSnapshot = {}

  for (const key of EMULATOR_HEAP_GLOBAL_KEYS) {
    emulatorHeapGlobalsSnapshot[key] = globalWindow[key]
  }
}

function restoreEmulatorHeapGlobals(): void {
  if (!emulatorHeapGlobalsSnapshot) {
    return
  }

  const globalWindow = window as unknown as Record<string, unknown>

  for (const key of EMULATOR_HEAP_GLOBAL_KEYS) {
    const value = emulatorHeapGlobalsSnapshot[key]
    if (value !== undefined) {
      globalWindow[key] = value
    }
  }
}

async function waitForClassAvailability(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await window.cjNew?.('java.util.Random')
      return
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    }
  }

  throw new Error('The browser randomizer runtime did not finish loading.')
}

function createRandomizerDebugState({
  preset,
  romName,
  romBytes,
}: {
  preset: RandomizerPresetId
  romName: string
  romBytes: number
}): RandomizerDebugState {
  const now = new Date().toISOString()
  const state: RandomizerDebugState = {
    startedAt: now,
    updatedAt: now,
    phase: 'running',
    currentStep: 'initializing',
    completedSteps: [],
    error: null,
    preset,
    romName,
    romBytes,
    telemetry: readRuntimeTelemetry(),
  }
  persistRandomizerDebugState(state)
  return state
}

function completeRandomizerDebugState(state: RandomizerDebugState): void {
  state.phase = 'completed'
  state.currentStep = 'completed'
  state.updatedAt = new Date().toISOString()
  state.telemetry = readRuntimeTelemetry()
  persistRandomizerDebugState(state)
}

function recordRandomizerError(error: unknown): void {
  const existing = readPersistedRandomizerDebugState()
  if (!existing) {
    return
  }

  existing.phase = 'failed'
  existing.error = error instanceof Error ? error.message : String(error)
  existing.updatedAt = new Date().toISOString()
  existing.telemetry = readRuntimeTelemetry()
  persistRandomizerDebugState(existing)
}

async function runRandomizerStep<T>(
  state: RandomizerDebugState,
  stepName: string,
  action: () => Promise<T> | T,
  timeoutMs = 45000,
): Promise<T> {
  state.currentStep = stepName
  state.updatedAt = new Date().toISOString()
  state.telemetry = readRuntimeTelemetry()
  persistRandomizerDebugState(state)
  console.log(`[randomizer] step:start ${stepName}`, state.telemetry)

  try {
    const result = await withTimeout(action(), timeoutMs, `Timed out during ${stepName}.`)
    state.completedSteps = [...state.completedSteps, stepName]
    state.updatedAt = new Date().toISOString()
    state.telemetry = readRuntimeTelemetry()
    persistRandomizerDebugState(state)
    console.log(`[randomizer] step:done ${stepName}`, state.telemetry)
    return result
  } catch (error) {
    state.phase = 'failed'
    state.error = error instanceof Error ? error.message : String(error)
    state.updatedAt = new Date().toISOString()
    state.telemetry = readRuntimeTelemetry()
    persistRandomizerDebugState(state)
    console.error(`[randomizer] step:failed ${stepName}`, error)
    throw error
  }
}

function persistRandomizerDebugState(state: RandomizerDebugState): void {
  window.localStorage.setItem(RANDOMIZER_DEBUG_KEY, JSON.stringify(state))
}

function readPersistedRandomizerDebugState(): RandomizerDebugState | null {
  const raw = window.localStorage.getItem(RANDOMIZER_DEBUG_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as RandomizerDebugState
  } catch {
    return null
  }
}

function readRuntimeTelemetry(): RandomizerDebugState['telemetry'] {
  const globalWindow = window as Window & {
    Module?: {
      HEAP8?: { length?: number }
    }
    HEAP8?: { length?: number }
  }
  const perfMemory = (performance as Performance & {
    memory?: {
      jsHeapSizeLimit?: number
      usedJSHeapSize?: number
      totalJSHeapSize?: number
    }
  }).memory

  return {
    moduleHeap8Length: typeof globalWindow.Module?.HEAP8?.length === 'number' ? globalWindow.Module.HEAP8.length : null,
    windowHeap8Length: typeof globalWindow.HEAP8?.length === 'number'
      ? globalWindow.HEAP8.length
      : null,
    jsHeapLimit: perfMemory?.jsHeapSizeLimit ?? null,
    usedJsHeapSize: perfMemory?.usedJSHeapSize ?? null,
    totalJsHeapSize: perfMemory?.totalJSHeapSize ?? null,
  }
}

function withTimeout<T>(promise: Promise<T> | T, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

async function loadPresetSettings(path: string): Promise<Uint8Array> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 10000)
  const basePath = `${import.meta.env.BASE_URL}${path}`.replace(/\/{2,}/g, '/')
  const presetUrl = new URL(basePath, window.location.origin).toString()
  const response = await fetch(
    `${presetUrl}${presetUrl.includes('?') ? '&' : '?'}t=${Date.now()}`,
    {
      cache: 'no-store',
      signal: controller.signal,
    },
  ).finally(() => {
    window.clearTimeout(timeoutId)
  })
  if (!response.ok) {
    throw new Error(`Could not load preset settings (${response.status}).`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

async function clearRandomizerStorage(): Promise<void> {
  await Promise.all(['/files', 'cjFS_/files/'].map(deleteDatabase))
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
    request.onsuccess = () => resolve()
  })
}

async function waitForRandomizedFile(path: string, timeoutMs = 120000): Promise<Blob> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const fileBlob = await window.cjFileBlob?.(path)
    if (fileBlob) {
      return fileBlob
    }

    await new Promise((resolve) => window.setTimeout(resolve, 500))
  }

  throw new Error('Timed out while waiting for the randomized ROM.')
}
