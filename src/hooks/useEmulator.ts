import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearRememberedRom,
  deleteVirtualFile,
  deriveRomPath,
  deriveSavePath,
  ensureBaseDirectories,
  loadRememberedRom,
  getWebMelon,
  isRuntimeLoaded,
  looksLikeNintendoDsRom,
  prepareStorage,
  readVirtualFile,
  releaseAllButtons,
  resumeAudioContext,
  saveFileExists,
  saveRememberedRom,
  syncStorage,
  writeVirtualFile,
} from '../lib/emulator'
import type { RememberedRom } from '../lib/emulator'

type ScreenFocus = 'top' | 'bottom'

export interface SessionMeta {
  gameTitle: string
  fileName: string
  fileSize: number
  romPath: string
  savePath: string
}

const BUNDLED_ROM_URL = 'https://pub-96d84523d8a341b79c022b2a33f1c324.r2.dev/pokemon-platinum.nds.gz'
const BUNDLED_ROM_NAME = 'pokemon-platinum.nds'

export function useEmulator() {
  const [sdkReady, setSdkReady] = useState(isRuntimeLoaded())
  const [storageReady, setStorageReady] = useState(false)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [fastForward, setFastForward] = useState(false)
  const [screenFocus, setScreenFocus] = useState<ScreenFocus>('top')
  const [status, setStatus] = useState('Loading the Nintendo DS runtime...')
  const [error, setError] = useState<string | null>(null)
  const [saveBanner, setSaveBanner] = useState('No save activity yet.')
  const [session, setSession] = useState<SessionMeta | null>(null)
  const [rememberedRom, setRememberedRom] = useState<RememberedRom | null>(null)
  const [romDownloadProgress, setRomDownloadProgress] = useState<number | null>(null)
  const saveBannerTimeout = useRef<number | null>(null)
  const bootstrappedRef = useRef(false)
  const pointerBridgeCleanupRef = useRef<(() => void) | null>(null)
  const autoFetchAttemptedRef = useRef(false)
  const sdkReadyRef = useRef(sdkReady)
  const storageReadyRef = useRef(storageReady)
  const startBufferRef = useRef<(fileName: string, fileSize: number, fileData: Uint8Array) => Promise<void>>(null!)
  sdkReadyRef.current = sdkReady
  storageReadyRef.current = storageReady

  const clearSaveTimer = () => {
    if (saveBannerTimeout.current !== null) {
      window.clearTimeout(saveBannerTimeout.current)
      saveBannerTimeout.current = null
    }
  }

  const detachRuntimeCanvasListeners = () => {
    const wm = window.WebMelon
    const bottomScreen = document.getElementById('bottom-screen')

    if (!wm || !bottomScreen) {
      return
    }

    bottomScreen.removeEventListener('mousedown', wm.emulator._eventListeners.mouseDown)
    bottomScreen.removeEventListener('mousemove', wm.emulator._eventListeners.mouseMove)
    bottomScreen.removeEventListener('mouseup', wm.emulator._eventListeners.mouseUp)
    bottomScreen.removeEventListener('touchstart', wm.emulator._eventListeners.touchStart)
    bottomScreen.removeEventListener('touchend', wm.emulator._eventListeners.touchEnd)
  }

  const detachRuntimeKeyboardListeners = () => {
    const wm = window.WebMelon

    if (!wm) {
      return
    }

    window.removeEventListener('keydown', wm.emulator._eventListeners.keyDown)
    window.removeEventListener('keyup', wm.emulator._eventListeners.keyUp)
  }

  const detachPointerBridge = () => {
    pointerBridgeCleanupRef.current?.()
    pointerBridgeCleanupRef.current = null
  }

  const attachPointerBridge = () => {
    const canvas = document.getElementById('bottom-screen')
    const emulator = window.WebMelon?._internal.emulator

    if (!canvas || !emulator) {
      return
    }

    detachPointerBridge()

    let touching = false
    canvas.style.touchAction = 'none'

    const getRelativeCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const mouseX = clientX - rect.left
      const mouseY = clientY - rect.top
      const scaleX = rect.width / 256
      const scaleY = rect.height / 192
      let scaledMouseX = mouseX / scaleX
      let scaledMouseY = mouseY / scaleY
      const isWide = rect.width / rect.height > 256 / 192
      const extraPixels = isWide
        ? (rect.width / 256 - rect.height / 192) * 256
        : (rect.height / 192 - rect.width / 256) * 192

      if (isWide) {
        scaledMouseX = ((mouseX - extraPixels / 2) / (rect.width - extraPixels)) * 256
      } else {
        scaledMouseY = ((mouseY - extraPixels / 2) / (rect.height - extraPixels)) * 192
      }

      return {
        x: scaledMouseX > 0 && scaledMouseX <= 256 ? scaledMouseX : 0,
        y: scaledMouseY > 0 && scaledMouseY <= 192 ? scaledMouseY : 0,
      }
    }

    const updateTouch = (event: PointerEvent) => {
      const { x, y } = getRelativeCoords(event.clientX, event.clientY)
      emulator.touchScreen(x, y)
    }

    const onPointerDown = (event: PointerEvent) => {
      touching = true
      canvas.setPointerCapture(event.pointerId)
      updateTouch(event)
      event.preventDefault()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!touching) {
        return
      }

      updateTouch(event)
      event.preventDefault()
    }

    const onPointerUp = (event: PointerEvent) => {
      if (!touching) {
        return
      }

      touching = false
      emulator.releaseScreen()
      event.preventDefault()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerUp)

    pointerBridgeCleanupRef.current = () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerUp)
    }
  }

  const setTransientSaveBanner = useCallback((message: string) => {
    clearSaveTimer()
    setSaveBanner(message)
    saveBannerTimeout.current = window.setTimeout(() => {
      setSaveBanner('Save storage is idle.')
      saveBannerTimeout.current = null
    }, 3200)
  }, [])

  useEffect(() => {
    const handleRuntimeReady = () => {
      if (bootstrappedRef.current) {
        return
      }

      bootstrappedRef.current = true
      setSdkReady(true)
      setStatus('Preparing browser storage...')
      const wm = getWebMelon()
      const currentInputSettings = wm.input.getInputSettings()

      wm.input.setInputSettings({
        ...currentInputSettings,
        keybinds: {
          ArrowUp: wm.constants.DS_INPUT_MAP.DPAD_UP,
          ArrowLeft: wm.constants.DS_INPUT_MAP.DPAD_LEFT,
          ArrowDown: wm.constants.DS_INPUT_MAP.DPAD_DOWN,
          ArrowRight: wm.constants.DS_INPUT_MAP.DPAD_RIGHT,
          z: wm.constants.DS_INPUT_MAP.A,
          x: wm.constants.DS_INPUT_MAP.B,
          a: wm.constants.DS_INPUT_MAP.Y,
          s: wm.constants.DS_INPUT_MAP.X,
          q: wm.constants.DS_INPUT_MAP.L,
          w: wm.constants.DS_INPUT_MAP.R,
          Enter: wm.constants.DS_INPUT_MAP.START,
          Shift: wm.constants.DS_INPUT_MAP.SELECT,
        },
      })

      wm.storage.onSaveInitiate(() => {
        setSaveBanner('Writing save data to browser storage...')
      })

      wm.storage.onSaveComplete(() => {
        setTransientSaveBanner('Save data synced to browser storage.')
      })

      void prepareStorage()
        .then(() => {
          ensureBaseDirectories()
          const cachedRom = loadRememberedRom()
          if (cachedRom && saveFileExists(cachedRom.romPath)) {
            setRememberedRom(cachedRom)
          } else {
            clearRememberedRom()
          }
          setStorageReady(true)
          setStatus('Runtime ready. Import a DS ROM to begin.')
        })
        .catch(() => {
          setError('Browser storage could not be prepared.')
          setStatus('Runtime loaded, but storage initialization failed.')
        })
    }

    if (isRuntimeLoaded()) {
      handleRuntimeReady()
      return
    }

    const waitForSdk = window.setInterval(() => {
      if (!window.WebMelon?.assembly) {
        return
      }

      window.clearInterval(waitForSdk)
      window.WebMelon.assembly.addLoadListener(handleRuntimeReady)
      setStatus('Compiling the Nintendo DS runtime...')
    }, 40)

    return () => {
      window.clearInterval(waitForSdk)
      clearSaveTimer()
    }
  }, [setTransientSaveBanner])

  const fetchBundledRom = async () => {
    try {
      setStatus('Downloading Pokemon Platinum...')
      setRomDownloadProgress(0)

      const response = await fetch(BUNDLED_ROM_URL)
      if (!response.ok) throw new Error(`Download failed (${response.status})`)

      const contentLength = Number(response.headers.get('Content-Length') || 0)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Download stream unavailable')

      const chunks: Uint8Array[] = []
      let received = 0

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.byteLength
        if (contentLength > 0) {
          setRomDownloadProgress(Math.round((received / contentLength) * 100))
        }
      }

      setStatus('Decompressing ROM...')
      setRomDownloadProgress(null)

      const compressed = new Blob(chunks as BlobPart[])
      const ds = new DecompressionStream('gzip')
      const decompressed = compressed.stream().pipeThrough(ds)
      const decompressedBlob = await new Response(decompressed).blob()
      const romData = new Uint8Array(await decompressedBlob.arrayBuffer())

      await startBufferRef.current!(BUNDLED_ROM_NAME, romData.byteLength, romData)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'ROM download failed'
      setError(message)
      setStatus('Could not auto-load ROM. Use the menu to import manually.')
      setRomDownloadProgress(null)
    }
  }

  useEffect(() => {
    const handleBlur = () => {
      releaseAllButtons()
    }

    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const stop = () => {
    if (!window.WebMelon?.emulator.hasEmulator()) {
      releaseAllButtons()
      setPaused(false)
      setFastForward(false)
      setRunning(false)
      return
    }

    detachRuntimeCanvasListeners()
    detachRuntimeKeyboardListeners()
    detachPointerBridge()
    window.WebMelon.emulator.shutdown()
    releaseAllButtons()
    setPaused(false)
    setFastForward(false)
    setRunning(false)
    setStatus('Session ended. Import another ROM when ready.')
  }

  const startBuffer = async (fileName: string, fileSize: number, fileData: Uint8Array) => {
    try {
      setError(null)

      if (!sdkReadyRef.current || !storageReadyRef.current) {
        throw new Error('The runtime is still preparing.')
      }

      if (!fileName.toLowerCase().endsWith('.nds')) {
        throw new Error('Only `.nds` ROM files are supported by this build.')
      }

      stop()
      setStatus('Loading ROM into the browser sandbox...')

      if (!looksLikeNintendoDsRom(fileData)) {
        throw new Error('This file does not look like a valid Nintendo DS ROM.')
      }

      const romPath = deriveRomPath(fileName)
      const savePath = deriveSavePath(fileName)
      const wm = getWebMelon()

      ensureBaseDirectories()
      wm.storage.write(romPath, fileData)

      wm.cart.createCart()
      if (!wm.cart.loadFileIntoCart(romPath)) {
        throw new Error('The ROM could not be loaded by the emulator.')
      }

      wm.emulator.createEmulator()
      wm.emulator.setSavePath(savePath)
      wm.emulator.loadFreeBIOS()
      wm.emulator.loadCart()

      await resumeAudioContext()

      window.requestAnimationFrame(() => {
        wm.emulator.startEmulation('top-screen', 'bottom-screen')
        detachRuntimeCanvasListeners()
        attachPointerBridge()
      })

      const rawTitle = wm.emulator.getGameTitle() ?? fileName
      const gameTitle = rawTitle.split('\n').filter(Boolean).join(' / ')

      setSession({
        gameTitle,
        fileName,
        fileSize,
        romPath,
        savePath,
      })
      const cachedRom = { fileName, fileSize, romPath }
      saveRememberedRom(cachedRom)
      setRememberedRom(cachedRom)
      setRunning(true)
      setPaused(false)
      setFastForward(false)
      setStatus('Emulation live. Save normally in-game and export backups regularly.')
      void syncStorage(false).then(() => {
        setTransientSaveBanner('ROM cached on this device for quick resume.')
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown emulator startup failure.'
      setError(message)
      setStatus('The session could not be started.')
    }
  }

  startBufferRef.current = startBuffer

  const start = async (file: File) => {
    const fileData = new Uint8Array(await file.arrayBuffer())
    await startBuffer(file.name, file.size, fileData)
  }

  const startFromUrl = useCallback(async (url: string, fileName?: string) => {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`ROM download failed with status ${response.status}.`)
    }

    const fileData = new Uint8Array(await response.arrayBuffer())
    const resolvedName =
      fileName ||
      url.split('/').pop()?.split('?')[0] ||
      'remote.nds'

    await startBuffer(resolvedName, fileData.byteLength, fileData)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const togglePause = () => {
    if (!window.WebMelon?.emulator.hasEmulator()) {
      return
    }

    if (paused) {
      window.WebMelon.emulator.resume()
      setPaused(false)
      setStatus('Emulation resumed.')
      return
    }

    window.WebMelon.emulator.pause()
    setPaused(true)
    setStatus('Emulation paused.')
  }

  const toggleFastForward = () => {
    if (!window.WebMelon?.emulator.hasEmulator()) {
      return
    }

    const nextSpeed = fastForward ? 1 : 2
    window.WebMelon.emulator.setEmulatorSpeed(nextSpeed)
    setFastForward(!fastForward)
    setStatus(nextSpeed === 2 ? 'Fast-forward enabled.' : 'Fast-forward disabled.')
  }

  const exportSave = async () => {
    if (!session) {
      throw new Error('No active game session.')
    }

    await syncStorage(false)

    if (!saveFileExists(session.savePath)) {
      throw new Error('No save file was found yet. Save in-game first.')
    }

    const bytes = readVirtualFile(session.savePath)
    const payload = new Uint8Array(bytes)
    const blob = new Blob([payload.buffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = session.fileName.replace(/\.nds$/i, '.sav')
    link.click()
    URL.revokeObjectURL(url)
    setTransientSaveBanner('Save backup downloaded.')
  }

  const importSave = async (file: File) => {
    if (!session) {
      throw new Error('Load a ROM before importing a save file.')
    }

    if (!file.name.toLowerCase().endsWith('.sav')) {
      throw new Error('Only `.sav` files can be imported.')
    }

    const data = new Uint8Array(await file.arrayBuffer())
    writeVirtualFile(session.savePath, data)
    await syncStorage(false)
    setTransientSaveBanner('Save imported. Reload the ROM or continue after the next save flush.')
  }

  const resumeRememberedRom = useCallback(async () => {
    if (!rememberedRom) {
      throw new Error('There is no cached ROM on this device.')
    }

    const romData = readVirtualFile(rememberedRom.romPath)
    await startBuffer(rememberedRom.fileName, rememberedRom.fileSize, romData)
  }, [rememberedRom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load ROM when ready: cached ROM > URL param > bundled download
  useEffect(() => {
    if (!sdkReady || !storageReady || running) return
    if (autoFetchAttemptedRef.current) return
    autoFetchAttemptedRef.current = true

    // If there's a cached ROM, resume it
    if (rememberedRom) {
      void resumeRememberedRom()
      return
    }

    // If URL params specify a ROM, use that
    const params = new URLSearchParams(window.location.search)
    const romUrl = params.get('romUrl')
    if (romUrl) {
      const romName = params.get('romName') ?? undefined
      void startFromUrl(romUrl, romName)
      return
    }

    // Otherwise, download the bundled ROM
    void fetchBundledRom()
  }, [sdkReady, storageReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const forgetRememberedRom = async () => {
    if (!rememberedRom) {
      return
    }

    deleteVirtualFile(rememberedRom.romPath)
    clearRememberedRom()
    setRememberedRom(null)
    await syncStorage(false)
    setTransientSaveBanner('Cached ROM removed from this device.')
  }

  return {
    sdkReady,
    storageReady,
    running,
    paused,
    fastForward,
    screenFocus,
    status,
    error,
    saveBanner,
    session,
    rememberedRom,
    romDownloadProgress,
    setScreenFocus,
    start,
    stop,
    togglePause,
    toggleFastForward,
    exportSave,
    importSave,
    startFromUrl,
    resumeRememberedRom,
    forgetRememberedRom,
  }
}
