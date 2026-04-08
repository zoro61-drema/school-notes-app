import { useEffect, useRef, useState } from "react";
import DrawingCanvas from "./DrawingCanvas";
import DrawingToolbar from "./DrawingToolbar";

export default function FullscreenDrawingModal({
  open,
  noteTitle,
  initialImage,
  saveState,
  onClose,
  onChange,
}) {
  const canvasApiRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#111827");
  const [brushSize, setBrushSize] = useState(6);
  const [showGrid, setShowGrid] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="drawing-modal-backdrop">
      <div className="drawing-modal">
        <header className="drawing-modal-header">
          <div>
            <p className="eyebrow">Drawing Studio</p>
            <h2>{noteTitle || "Untitled Note"}</h2>
          </div>
          <div className="drawing-status-pill">{saveState}</div>
        </header>

        <DrawingToolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          canUndo={canUndo}
          canRedo={canRedo}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          onUndo={() => canvasApiRef.current?.undo()}
          onRedo={() => canvasApiRef.current?.redo()}
          onClear={() => canvasApiRef.current?.clear()}
          onClose={onClose}
        />

        <div className="drawing-surface">
          <DrawingCanvas
            ref={canvasApiRef}
            initialImage={initialImage}
            tool={tool}
            color={color}
            brushSize={brushSize}
            showGrid={showGrid}
            onHistoryChange={(nextCanUndo, nextCanRedo) => {
              setCanUndo(nextCanUndo);
              setCanRedo(nextCanRedo);
            }}
            onDrawingChange={onChange}
          />
        </div>
      </div>
    </div>
  );
}
