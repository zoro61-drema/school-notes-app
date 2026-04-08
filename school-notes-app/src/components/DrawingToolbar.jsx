const SWATCHES = ["#111827", "#2563eb", "#059669", "#ef4444", "#f59e0b", "#7c3aed"];

export default function DrawingToolbar({
  tool,
  setTool,
  color,
  setColor,
  brushSize,
  setBrushSize,
  canUndo,
  canRedo,
  showGrid,
  setShowGrid,
  onUndo,
  onRedo,
  onClear,
  onClose,
}) {
  return (
    <div className="drawing-toolbar">
      <div className="drawing-toolbar-group">
        {[
          ["pen", "Pen"],
          ["highlighter", "Highlighter"],
          ["eraser", "Eraser"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`toolbar-chip ${tool === value ? "active" : ""}`}
            onClick={() => setTool(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="drawing-toolbar-group">
        <div className="toolbar-label">Colors</div>
        <div className="swatch-row">
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`color-swatch ${color === swatch ? "active" : ""}`}
              style={{ "--swatch-color": swatch }}
              onClick={() => setColor(swatch)}
              aria-label={`Use ${swatch} ink`}
            />
          ))}
        </div>
      </div>

      <div className="drawing-toolbar-group slider-group">
        <label htmlFor="brush-size" className="toolbar-label">
          Brush {brushSize}px
        </label>
        <input
          id="brush-size"
          type="range"
          min="2"
          max="28"
          value={brushSize}
          onChange={(event) => setBrushSize(Number(event.target.value))}
        />
      </div>

      <div className="drawing-toolbar-group">
        <button type="button" className="ghost-btn" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="ghost-btn" onClick={onRedo} disabled={!canRedo}>
          Redo
        </button>
        <button type="button" className="ghost-btn" onClick={() => setShowGrid((value) => !value)}>
          {showGrid ? "Hide Grid" : "Show Grid"}
        </button>
        <button type="button" className="danger-btn" onClick={onClear}>
          Clear
        </button>
        <button type="button" className="primary-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
