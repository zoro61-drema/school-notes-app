import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
} from "react";

const EMPTY_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function getPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: event.pressure && event.pressure > 0 ? event.pressure : 0.5,
  };
}

const DrawingCanvas = forwardRef(function DrawingCanvas(
  { initialImage, tool, color, brushSize, showGrid, onHistoryChange, onDrawingChange },
  ref
) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const drawingStateRef = useRef({
    activePointerId: null,
    isDrawing: false,
    lastPoint: null,
  });
  const historyRef = useRef([null]);
  const historyIndexRef = useRef(0);
  const initializedRef = useRef(false);

  const emitHistory = useEffectEvent(() => {
    onHistoryChange(
      historyIndexRef.current > 0,
      historyIndexRef.current < historyRef.current.length - 1
    );
  });

  const redrawFromHistory = useEffectEvent(async (historyValue) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!historyValue) {
      emitHistory();
      return;
    }

    try {
      const image = await loadImage(historyValue);
      ctx.drawImage(image, 0, 0, rect.width, rect.height);
    } catch {
      ctx.drawImage(await loadImage(EMPTY_PIXEL), 0, 0, rect.width, rect.height);
    }
  });

  const resizeCanvas = useEffectEvent(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const snapshot = initializedRef.current
      ? historyRef.current[historyIndexRef.current]
      : initialImage || null;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.imageSmoothingEnabled = true;

    initializedRef.current = true;
    await redrawFromHistory(snapshot);
    emitHistory();
  });

  const pushHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const snapshot = canvas.toDataURL("image/png");
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(snapshot);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    emitHistory();
    onDrawingChange(snapshot);
  };

  const drawSegment = (ctx, previous, next) => {
    const midpointX = (previous.x + next.x) / 2;
    const midpointY = (previous.y + next.y) / 2;
    const pressureScale = Math.max(0.65, next.pressure);

    ctx.lineWidth = tool === "highlighter" ? brushSize * 1.8 : brushSize * pressureScale;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.globalAlpha = tool === "highlighter" ? 0.2 : 1;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.quadraticCurveTo(previous.x, previous.y, midpointX, midpointY);
    ctx.stroke();
  };

  const finishStroke = () => {
    const state = drawingStateRef.current;
    if (!state.isDrawing) return;

    state.isDrawing = false;
    state.activePointerId = null;
    state.lastPoint = null;
    pushHistory();
  };

  useImperativeHandle(ref, () => ({
    undo: async () => {
      if (historyIndexRef.current === 0) return;
      historyIndexRef.current -= 1;
      await redrawFromHistory(historyRef.current[historyIndexRef.current]);
      emitHistory();
      onDrawingChange(historyRef.current[historyIndexRef.current] || null);
    },
    redo: async () => {
      if (historyIndexRef.current >= historyRef.current.length - 1) return;
      historyIndexRef.current += 1;
      await redrawFromHistory(historyRef.current[historyIndexRef.current]);
      emitHistory();
      onDrawingChange(historyRef.current[historyIndexRef.current] || null);
    },
    clear: async () => {
      historyRef.current = [null];
      historyIndexRef.current = 0;
      await redrawFromHistory(null);
      emitHistory();
      onDrawingChange(null);
    },
  }));

  useEffect(() => {
    resizeCanvas();

    const handleResize = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        resizeCanvas();
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    historyRef.current = [initialImage || null];
    historyIndexRef.current = 0;
    redrawFromHistory(initialImage || null).then(() => {
      emitHistory();
    });
  }, [initialImage]);

  return (
    <div className={`drawing-canvas-shell ${showGrid ? "show-grid" : ""}`}>
      <canvas
        ref={canvasRef}
        className="drawing-full-canvas"
        onPointerDown={(event) => {
          const canvas = canvasRef.current;
          if (!canvas) return;

          canvas.setPointerCapture(event.pointerId);
          const point = getPoint(event, canvas);
          const ctx = canvas.getContext("2d");

          drawingStateRef.current = {
            activePointerId: event.pointerId,
            isDrawing: true,
            lastPoint: point,
          };

          if (tool === "eraser") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.beginPath();
            ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = tool === "highlighter" ? 0.2 : 1;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(point.x, point.y, Math.max(brushSize / 2, 1.5), 0, Math.PI * 2);
            ctx.fill();
          }
        }}
        onPointerMove={(event) => {
          const canvas = canvasRef.current;
          const state = drawingStateRef.current;
          if (!canvas || !state.isDrawing || state.activePointerId !== event.pointerId) return;

          const nextPoint = getPoint(event, canvas);
          const ctx = canvas.getContext("2d");
          drawSegment(ctx, state.lastPoint, nextPoint);
          state.lastPoint = nextPoint;
        }}
        onPointerUp={(event) => {
          const canvas = canvasRef.current;
          const state = drawingStateRef.current;
          if (!canvas || state.activePointerId !== event.pointerId) return;

          try {
            canvas.releasePointerCapture(event.pointerId);
          } catch {
            void 0;
          }

          finishStroke();
        }}
        onPointerCancel={finishStroke}
        onPointerLeave={() => {
          if (drawingStateRef.current.isDrawing) {
            finishStroke();
          }
        }}
      />
    </div>
  );
});

export default DrawingCanvas;
