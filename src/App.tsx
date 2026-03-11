import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ControlButton } from './components/ControlButton'
import { useEmulator } from './hooks/useEmulator'
import { formatBytes } from './lib/emulator'

function App() {
  const romInputRef = useRef<HTMLInputElement | null>(null)
  const saveInputRef = useRef<HTMLInputElement | null>(null)
  const [controlScale, setControlScale] = useState(() => {
    const saved = window.localStorage.getItem('platinum-web:control-scale')
    return saved ? Number(saved) : 1
  })
  const [controlOpacity, setControlOpacity] = useState(() => {
    const saved = window.localStorage.getItem('platinum-web:control-opacity')
    return saved ? Number(saved) : 0.92
  })
  const {
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
  } = useEmulator()

  useEffect(() => {
    window.localStorage.setItem('platinum-web:control-scale', String(controlScale))
  }, [controlScale])

  useEffect(() => {
    window.localStorage.setItem('platinum-web:control-opacity', String(controlOpacity))
  }, [controlOpacity])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const romUrl = params.get('romUrl')

    if (!romUrl || !sdkReady || !storageReady || running) {
      return
    }

    const romName = params.get('romName') ?? undefined
    void startFromUrl(romUrl, romName)
  }, [running, sdkReady, startFromUrl, storageReady])

  const sessionFacts = useMemo(() => {
    if (!session) {
      return [
        'Keyboard: arrows move, Z = A, X = B, Enter = Start.',
        'Bottom-screen clicks are routed through a direct pointer bridge.',
        'Imported ROMs can now be cached on-device for quick resume.',
      ]
    }

    return [
      session.gameTitle,
      session.fileName,
      `${formatBytes(session.fileSize)} loaded`,
      'Keyboard: arrows move, Z = A, X = B, Enter = Start.',
    ]
  }, [session])

  return (
    <main
      className="shell"
      style={
        {
          '--control-scale': controlScale,
          '--control-opacity': controlOpacity,
        } as CSSProperties
      }
    >
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Field Kit For Nintendo DS Sessions</p>
          <h1>Platinum Web</h1>
          <p className="lede">
            A portable-browser command deck for Pokemon Platinum: cached local sessions,
            thumb-first controls, fast screen promotion, and save recovery built for real play.
          </p>
          <div className="hero-badges">
            <span>On-device ROM cache</span>
            <span>PWA installable</span>
            <span>Real save export/import</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-row">
            <span>Runtime</span>
            <strong>{sdkReady ? 'Loaded' : 'Compiling'}</strong>
          </div>
          <div className="status-row">
            <span>Storage</span>
            <strong>{storageReady ? 'Ready' : 'Preparing'}</strong>
          </div>
          <div className="status-row">
            <span>Session</span>
            <strong>{running ? 'Live' : 'Idle'}</strong>
          </div>
          <div className="status-row">
            <span>Cached ROM</span>
            <strong>{rememberedRom ? 'Available' : 'Empty'}</strong>
          </div>
          <p className="status-text">{status}</p>
          <p className="save-pill">{saveBanner}</p>
          {error ? <p className="error-pill">{error}</p> : null}
        </div>
      </section>

      <section className="console-grid">
        <div className="stage-panel">
          <div className="stage-header">
            <div>
              <p className="panel-label">Current Cartridge</p>
              <h2>{session?.gameTitle ?? rememberedRom?.fileName ?? 'No ROM loaded'}</h2>
            </div>
            <div className="screen-toggle">
              <button
                className={screenFocus === 'top' ? 'mini-button active' : 'mini-button'}
                onClick={() => setScreenFocus('top')}
              >
                Top Focus
              </button>
              <button
                className={screenFocus === 'bottom' ? 'mini-button active' : 'mini-button'}
                onClick={() => setScreenFocus('bottom')}
              >
                Touch Focus
              </button>
            </div>
          </div>

          <div className={`screen-stack ${screenFocus === 'bottom' ? 'bottom-focus' : ''}`}>
            <div className="screen-card top-screen-card">
              <span className="screen-label">Top Screen</span>
              <canvas id="top-screen" width="256" height="192" />
            </div>
            <div className="screen-card bottom-screen-card">
              <span className="screen-label">Bottom Screen</span>
              <canvas id="bottom-screen" width="256" height="192" />
            </div>
          </div>

          <div className="disclosure">
            <p>
              Imported ROMs can stay cached on this device for quick restart, and save files can
              be backed up or restored directly from the shell.
            </p>
          </div>
        </div>

        <div className="control-panel">
          <div className="launch-panel">
            <div className="launch-copy">
              <p className="panel-label">Launch Bay</p>
              <h3>{rememberedRom ? 'Resume Or Swap Cartridges' : 'Load A Cartridge'}</h3>
              <p>
                {rememberedRom
                  ? `${rememberedRom.fileName} is cached locally for quick restart.`
                  : 'Import an `.nds` file or keep the current one cached on this device.'}
              </p>
            </div>
            <div className="launch-actions">
              <button className="action-button" onClick={() => romInputRef.current?.click()}>
                Import ROM
              </button>
              <button
                className="action-button ghost"
                disabled={!rememberedRom || running}
                onClick={() => resumeRememberedRom()}
              >
                Resume Cached ROM
              </button>
              <button
                className="action-button ghost"
                disabled={!rememberedRom}
                onClick={() => void forgetRememberedRom()}
              >
                Forget Cached ROM
              </button>
              <button
                className="action-button ghost"
                disabled={!session}
                onClick={() => saveInputRef.current?.click()}
              >
                Import Save
              </button>
              <button className="action-button ghost" disabled={!session} onClick={() => exportSave()}>
                Export Save
              </button>
            </div>
          </div>

          <div className="tune-panel">
            <div>
              <p className="panel-label">Control Scale</p>
              <input
                className="range-input"
                type="range"
                min="0.82"
                max="1.28"
                step="0.01"
                value={controlScale}
                onChange={(event) => setControlScale(Number(event.target.value))}
              />
            </div>
            <div>
              <p className="panel-label">Control Opacity</p>
              <input
                className="range-input"
                type="range"
                min="0.55"
                max="1"
                step="0.01"
                value={controlOpacity}
                onChange={(event) => setControlOpacity(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="utility-cluster compact">
            <button className="mini-button" disabled={!running} onClick={() => togglePause()}>
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button className="mini-button" disabled={!running} onClick={() => toggleFastForward()}>
              {fastForward ? '1x' : '2x'}
            </button>
            <button className="mini-button" disabled={!running} onClick={() => stop()}>
              Stop
            </button>
          </div>

          <div className="control-deck">
            <div className="dpad">
              <ControlButton button="DPAD_UP" label="Up" className="up" />
              <ControlButton button="DPAD_LEFT" label="Left" className="left" />
              <ControlButton button="DPAD_RIGHT" label="Right" className="right" />
              <ControlButton button="DPAD_DOWN" label="Down" className="down" />
            </div>

            <div className="face-buttons">
              <ControlButton button="X" label="X" accent="secondary" className="x" />
              <ControlButton button="Y" label="Y" accent="secondary" className="y" />
              <ControlButton button="A" label="A" accent="primary" className="a" />
              <ControlButton button="B" label="B" accent="primary" className="b" />
            </div>
          </div>

          <div className="shoulders">
            <ControlButton button="L" label="L" accent="utility" />
            <ControlButton button="R" label="R" accent="utility" />
            <ControlButton button="SELECT" label="Select" accent="utility" />
            <ControlButton button="START" label="Start" accent="utility" />
          </div>

          <div className="facts-card">
            <p className="panel-label">Session Notes</p>
            <ul>
              {sessionFacts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <input
        ref={romInputRef}
        className="hidden-input"
        type="file"
        accept=".nds"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void start(file)
          }
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
          if (file) {
            void importSave(file)
          }
          event.currentTarget.value = ''
        }}
      />
    </main>
  )
}

export default App
