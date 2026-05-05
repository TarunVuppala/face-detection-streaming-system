function App() {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Real-time face ROI streaming</p>
          <h1>Camera feed, detection, and ROI metadata in one view.</h1>
          <p className="hero-copy">
            The frontend will capture WebM chunks from the browser camera, send them to
            FastAPI, and render annotated frames returned over WebSockets.
          </p>
        </div>
        <div className="status-card">
          <span className="status-dot" />
          <span>Waiting for backend stream</span>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="Streaming dashboard preview">
        <div className="video-panel">
          <div className="video-placeholder">Annotated feed</div>
        </div>
        <aside className="roi-panel">
          <h2>ROI data</h2>
          <dl>
            <div>
              <dt>Session</dt>
              <dd>Not started</dd>
            </div>
            <div>
              <dt>Frame</dt>
              <dd>-</dd>
            </div>
            <div>
              <dt>Box</dt>
              <dd>-</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>-</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  )
}

export default App
