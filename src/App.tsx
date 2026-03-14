import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEmulator } from './hooks/useEmulator'
import { formatBytes, pressButton, releaseButton, type DsButton } from './lib/emulator'
import { RANDOMIZER_PRESETS } from './lib/randomizer'

/* ── Inline SVG icons ── */

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

/* ── Face / D-pad button helper ── */

function GameButton({
  button,
  label,
  className,
}: {
  button: DsButton
  label: string
  className: string
}) {
  const begin = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pressButton(button)
  }
  const end = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    releaseButton(button)
  }

  return (
    <button
      className={className}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    >
      {label}
    </button>
  )
}

function DpadCluster() {
  const [activeButton, setActiveButton] = useState<DsButton | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const currentButtonRef = useRef<DsButton | null>(null)

  const releaseActive = () => {
    if (currentButtonRef.current) {
      releaseButton(currentButtonRef.current)
      currentButtonRef.current = null
    }
    activePointerIdRef.current = null
    setActiveButton(null)
  }

  const resolveDirection = (event: ReactPointerEvent<HTMLDivElement>): DsButton | null => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const dx = x - rect.width / 2
    const dy = y - rect.height / 2
    const deadZone = Math.min(rect.width, rect.height) * 0.12

    if (Math.abs(dx) < deadZone && Math.abs(dy) < deadZone) {
      return currentButtonRef.current
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? 'DPAD_RIGHT' : 'DPAD_LEFT'
    }

    return dy >= 0 ? 'DPAD_DOWN' : 'DPAD_UP'
  }

  const setDirection = (nextButton: DsButton | null) => {
    if (nextButton === currentButtonRef.current) {
      return
    }

    if (currentButtonRef.current) {
      releaseButton(currentButtonRef.current)
    }

    if (nextButton) {
      pressButton(nextButton)
    }

    currentButtonRef.current = nextButton
    setActiveButton(nextButton)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    activePointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setDirection(resolveDirection(event))
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    event.preventDefault()
    setDirection(resolveDirection(event))
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    event.preventDefault()
    releaseActive()
  }

  useEffect(() => {
    return () => {
      if (currentButtonRef.current) {
        releaseButton(currentButtonRef.current)
      }
    }
  }, [])

  return (
    <div
      className={`dpad-container${activeButton ? ` active-${activeButton.toLowerCase().replace('dpad_', '')}` : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
    >
      <div className="dpad-cross" />
      <div className="dpad-center" />
      <div className="dpad-zone up" />
      <div className="dpad-zone down" />
      <div className="dpad-zone left" />
      <div className="dpad-zone right" />
    </div>
  )
}

/* ── Shoulder button helper ── */

function ShoulderButton({ button, label }: { button: DsButton; label: string }) {
  const begin = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pressButton(button)
  }
  const end = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    releaseButton(button)
  }

  return (
    <button
      className="shoulder-btn"
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    >
      {label}
    </button>
  )
}

/* ── Main App ── */

function App() {
  const romInputRef = useRef<HTMLInputElement | null>(null)
  const saveInputRef = useRef<HTMLInputElement | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [controlScale, setControlScale] = useState(() => {
    const saved = window.localStorage.getItem('pokemon:control-scale')
    return saved ? Number(saved) : 1
  })
  const [controlOpacity, setControlOpacity] = useState(() => {
    const saved = window.localStorage.getItem('pokemon:control-opacity')
    return saved ? Number(saved) : 0.92
  })

  const {
    sdkReady,
    storageReady,
    running,
    launching,
    paused,
    fastForward,
    status,
    error,
    saveBanner,
    session,
    rememberedRom,
    romDownloadProgress,
    start,
    stop,
    togglePause,
    toggleFastForward,
    exportSave,
    importSave,
    startBundledRom,
    startBundledRandomizedRom,
    resumeRememberedRom,
    forgetRememberedRom,
  } = useEmulator()

  useEffect(() => {
    window.localStorage.setItem('pokemon:control-scale', String(controlScale))
  }, [controlScale])

  useEffect(() => {
    window.localStorage.setItem('pokemon:control-opacity', String(controlOpacity))
  }, [controlOpacity])

  // LED status
  const ledClass = useMemo(() => {
    if (error) return 'status-led error'
    if (running) return 'status-led live'
    if (!sdkReady || !storageReady) return 'status-led loading'
    return 'status-led'
  }, [error, running, sdkReady, storageReady])

  // Save banner visibility
  const showSaveBanner = saveBanner !== 'No save activity yet.' && saveBanner !== 'Save storage is idle.'

  const showWelcome = !running
  const canLaunch = sdkReady && storageReady && !launching && romDownloadProgress === null

  return (
    <main
      className="dsi-shell"
      style={
        {
          '--control-scale': controlScale,
          '--control-opacity': controlOpacity,
        } as CSSProperties
      }
    >
      {/* ── Top clamshell half ── */}
      <div className="top-shell">
        <div className="shoulder-bar">
          <ShoulderButton button="L" label="L" />
          <ShoulderButton button="R" label="R" />
        </div>
        <div className="screen-bezel top-bezel">
          {showWelcome && (
            <div className="welcome-overlay">
              <div className="welcome-title">Platinum Web</div>
              <div className="welcome-sub">Nintendo DS in your browser</div>
              {romDownloadProgress !== null ? (
                <div className="download-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${romDownloadProgress}%` }} />
                  </div>
                  <div className="progress-label">Downloading... {romDownloadProgress}%</div>
                </div>
              ) : (
                <>
                  <div className="welcome-sub">{status}</div>
                  <div className="welcome-actions">
                    <button
                      className="welcome-btn"
                      disabled={!canLaunch}
                      onClick={() => void startBundledRom()}
                    >
                      Play Vanilla
                    </button>
                    {RANDOMIZER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        className="welcome-btn ghost"
                        disabled={!canLaunch}
                        onClick={() => void startBundledRandomizedRom(preset.id)}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      className="welcome-btn subtle"
                      disabled={launching}
                      onClick={() => romInputRef.current?.click()}
                    >
                      Import Your Own ROM
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <canvas id="top-screen" width="256" height="192" />
        </div>
      </div>

      {/* ── Hinge ── */}
      <div className="hinge">
        <div className={ledClass} />
      </div>

      {/* ── Bottom clamshell half ── */}
      <div className="bottom-shell">
        <div className="dpad-section">
          <DpadCluster />
        </div>

        <div className="bottom-screen-wrapper">
          <div className="screen-bezel bottom-bezel">
            <canvas id="bottom-screen" width="256" height="192" />
          </div>
        </div>

        <div className="face-section">
          <div className="face-container">
            <GameButton button="X" label="X" className="face-btn x-btn" />
            <GameButton button="Y" label="Y" className="face-btn y-btn" />
            <GameButton button="A" label="A" className="face-btn a-btn" />
            <GameButton button="B" label="B" className="face-btn b-btn" />
          </div>
        </div>

        <div className="utility-row">
          <GameButton button="SELECT" label="Select" className="pill-btn" />
          <GameButton button="START" label="Start" className="pill-btn" />
        </div>

        <div className="status-bar">
          <span className="status-text">{status}</span>
        </div>
      </div>

      {/* Menu toggle button */}
      <button
        className={`menu-toggle ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(!drawerOpen)}
      >
        <GearIcon />
      </button>

      {/* Drawer backdrop */}
      <div
        className={`drawer-backdrop ${drawerOpen ? 'visible' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Settings / Actions drawer */}
      <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-handle" />

        {/* Session info */}
        {session && (
          <div className="drawer-section">
            <div className="drawer-label">Now Playing</div>
            <div className="session-info">
              <div className="session-info-row">
                <span>Title</span>
                <span>{session.gameTitle}</span>
              </div>
              <div className="session-info-row">
                <span>File</span>
                <span>{session.fileName}</span>
              </div>
              <div className="session-info-row">
                <span>Size</span>
                <span>{formatBytes(session.fileSize)}</span>
              </div>
              <div className="session-info-row">
                <span>Mode</span>
                <span>{session.sourceLabel}</span>
              </div>
            </div>
          </div>
        )}

        {/* Playback */}
        <div className="drawer-section">
          <div className="drawer-label">Playback</div>
          <div className="playback-row">
            <button
              className={`playback-btn ${paused ? 'active' : ''}`}
              disabled={!running}
              onClick={() => togglePause()}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className={`playback-btn ${fastForward ? 'active' : ''}`}
              disabled={!running}
              onClick={() => toggleFastForward()}
            >
              {fastForward ? '1x' : '2x'}
            </button>
            <button
              className="playback-btn"
              disabled={!running}
              onClick={() => stop()}
            >
              Stop
            </button>
          </div>
        </div>

        {/* Cartridge */}
        <div className="drawer-section">
          <div className="drawer-label">Cartridge</div>
          <div className="drawer-actions">
            <button
              className="drawer-btn primary"
              disabled={launching}
              onClick={() => void startBundledRom()}
            >
              Play Vanilla
            </button>
            {RANDOMIZER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className="drawer-btn"
                disabled={launching}
                onClick={() => void startBundledRandomizedRom(preset.id)}
              >
                {preset.label}
              </button>
            ))}
            <button
              className="drawer-btn"
              onClick={() => romInputRef.current?.click()}
            >
              Import ROM
            </button>
            <button
              className="drawer-btn"
              disabled={!rememberedRom || running}
              onClick={() => resumeRememberedRom()}
            >
              Resume Cached
            </button>
            <button
              className="drawer-btn danger"
              disabled={!rememberedRom}
              onClick={() => void forgetRememberedRom()}
            >
              Forget Cached
            </button>
          </div>
        </div>

        {/* Saves */}
        <div className="drawer-section">
          <div className="drawer-label">Save Data</div>
          <div className="drawer-actions">
            <button
              className="drawer-btn"
              disabled={!session}
              onClick={() => exportSave()}
            >
              Export Save
            </button>
            <button
              className="drawer-btn"
              disabled={!session}
              onClick={() => saveInputRef.current?.click()}
            >
              Import Save
            </button>
          </div>
        </div>

        {/* Tuning */}
        <div className="drawer-section">
          <div className="drawer-label">Controls</div>
          <div className="slider-row">
            <span className="slider-label">Scale</span>
            <input
              className="slider-input"
              type="range"
              min="0.82"
              max="1.28"
              step="0.01"
              value={controlScale}
              onChange={(e) => setControlScale(Number(e.target.value))}
            />
          </div>
          <div className="slider-row">
            <span className="slider-label">Opacity</span>
            <input
              className="slider-input"
              type="range"
              min="0.55"
              max="1"
              step="0.01"
              value={controlOpacity}
              onChange={(e) => setControlOpacity(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Info */}
        <div className="drawer-section">
          <div className="drawer-label">Keyboard</div>
          <div className="session-info">
            <div className="session-info-row"><span>D-pad</span><span>Arrow keys</span></div>
            <div className="session-info-row"><span>A / B</span><span>Z / X</span></div>
            <div className="session-info-row"><span>X / Y</span><span>S / A</span></div>
            <div className="session-info-row"><span>L / R</span><span>Q / W</span></div>
            <div className="session-info-row"><span>Start</span><span>Enter</span></div>
            <div className="session-info-row"><span>Select</span><span>Shift</span></div>
          </div>
        </div>
      </div>

      {/* Save toast */}
      <div className={`save-toast ${showSaveBanner ? 'visible' : ''}`}>
        {saveBanner}
      </div>

      {/* Error toast */}
      {error && (
        <div className="error-toast">{error}</div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={romInputRef}
        className="hidden-input"
        type="file"
        accept=".nds"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void start(file)
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={saveInputRef}
        className="hidden-input"
        type="file"
        accept=".sav"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importSave(file)
          event.currentTarget.value = ''
        }}
      />
    </main>
  )
}

export default App
