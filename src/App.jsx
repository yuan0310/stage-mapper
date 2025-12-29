import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MousePointer2, Crop, Move, Lock, Unlock, Monitor, Download, Plus, Minus, Search, Undo, Redo, Image as ImageIcon, Trash2, FileJson, Eye, EyeOff } from 'lucide-react';
import { Box } from 'lucide-react';

// --- Engineering Constants ---
// --- Engineering Constants ---
// Resolution moved to State


function App() {
  /* --- State --- */
  const [image, setImage] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState('layout'); // layout | slice
  const [snap, setSnap] = useState(true);
  const [scanThreshold, setScanThreshold] = useState(15);
  const [showLines, setShowLines] = useState(true);
  const [resolution, setResolution] = useState({ w: 1920, h: 1200 });
  const [view, setView] = useState({ x: 0, y: 0, scale: 0.8 });
  const [cursorHUD, setCursorHUD] = useState(null);

  // --- State & History ---
  const [master, setMaster] = useState({ x: 100, y: 100, w: 800, rotation: 0 });
  const [slices, setSlices] = useState([]);
  const [selectedId, setSelectedId] = useState('master');

  // History Stacks
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const pushHistory = useCallback(() => {
    // Save snapshot of current state
    const snapshot = {
      master: { ...master },
      slices: JSON.parse(JSON.stringify(slices))
    };
    setHistory(h => [...h.slice(-19), snapshot]); // Keep last 20
    setFuture([]); // Clear redo
  }, [master, slices]);

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    const current = { master: { ...master }, slices: JSON.parse(JSON.stringify(slices)) };

    setFuture(f => [current, ...f]);
    setHistory(h => h.slice(0, -1));

    setMaster(prev.master);
    setSlices(prev.slices);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    const current = { master: { ...master }, slices: JSON.parse(JSON.stringify(slices)) };

    setHistory(h => [...h, current]);
    setFuture(f => f.slice(1));

    setMaster(next.master);
    setSlices(next.slices);
  };

  // Interaction State Machine
  const [state, setState] = useState({
    active: false,
    type: null, // MOVE | RESIZE | ROTATE | DRAW | PAN
    originX: 0, originY: 0,
    startX: 0, startY: 0,
    snapshot: null,
    historySaved: false, // Track if we saved history for this move
    tempRect: null
  });

  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [guides, setGuides] = useState({ x: null, y: null });
  const [edges, setEdges] = useState({ x: [], y: [] });

  const viewportRef = useRef(null);

  // --- Infinite Canvas Logic (Matrix) ---
  const toCanvas = (mx, my) => {
    return {
      x: (mx - view.x) / view.scale,
      y: (my - view.y) / view.scale
    };
  };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey || e.deltaMode === 0 || !e.ctrlKey) {
      e.preventDefault();
      const rect = viewportRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = -e.deltaY * 0.001;
      const newScale = Math.min(Math.max(0.01, view.scale + delta), 20); // Infinite Zoom

      const newX = mx - (mx - view.x) * (newScale / view.scale);
      const newY = my - (my - view.y) * (newScale / view.scale);

      setView({ x: newX, y: newY, scale: newScale });
    }
  };

  // --- Hotkeys & Clipboard ---
  useEffect(() => {
    const down = (e) => {
      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }

      if (e.code === 'Space' && !e.repeat) setIsSpacePressed(true);
      if (e.key.toLowerCase() === 's') setSnap(v => !v);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && selectedId !== 'master') {
          pushHistory(); // Save before delete
          setSlices(v => v.filter(s => s.id !== selectedId));
          setSelectedId('master');
        }
      }
    };
    const up = (e) => { if (e.code === 'Space') setIsSpacePressed(false); };

    // Paste Handler
    const handlePaste = (e) => {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => setImage(event.target.result);
          reader.readAsDataURL(blob);
          e.preventDefault();
          break;
        }
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('paste', handlePaste);
    };
  }, [selectedId, master, slices, history, future]); // Dependencies for history closures

  // Image Helper & Smart Auto-Fit
  useEffect(() => {
    if (!image) return;
    const img = new Image(); img.src = image;
    img.onload = () => {
      if (imgSize.w === 0) {
        setImgSize({ w: img.width, h: img.height });
        // Auto Fit logic...
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight - 64;
        const scaleW = (viewportW * 0.85) / img.width;
        const scaleH = (viewportH * 0.85) / img.height;
        const fitScale = Math.min(scaleW, scaleH);
        const centerX = (viewportW - img.width * fitScale) / 2;
        const centerY = (viewportH - img.height * fitScale) / 2;
        setView({ x: centerX, y: centerY, scale: fitScale });
      }

      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;

      const xSet = new Set([0, img.width, img.width / 2]);
      const ySet = new Set([0, img.height, img.height / 2]);

      // Grandmaster Scan: Dense Grid to catch all objects
      // We scan a line every ~50px to ensure we hit every object
      const STEP_Y = Math.max(20, Math.floor(img.height / 20));


      // Helper: Get Luminance (0-255)
      const getLum = (i) => {
        const a = d[i + 3];
        if (a < 50) return 255; // Treat transparent as White (or Background)
        return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      };

      // Grandmaster Scan v4: Pixel-Perfect Projection
      // No more striding. We scan every pixel to catch 1px CAD lines.

      const xScore = new Float32Array(img.width);
      const yScore = new Float32Array(img.height);

      // Pass 1: X-Projection (Detect Vertical Lines)
      // We look for contrast changes horizontally.
      for (let y = 0; y < img.height; y++) {
        let lastLum = getLum((y * img.width) * 4);
        for (let x = 1; x < img.width; x++) {
          const idx = (y * img.width + x) * 4;
          const lum = getLum(idx);

          // If explicit edge detected (Contrast > Threshold)
          if (Math.abs(lum - lastLum) > scanThreshold) {
            xScore[x]++; // Vote for this X column
          }
          lastLum = lum;
        }
      }

      // Pass 2: Y-Projection (Detect Horizontal Lines)
      // We look for contrast changes vertically.
      for (let x = 0; x < img.width; x++) {
        let lastLum = getLum(x * 4);
        for (let y = 1; y < img.height; y++) {
          const idx = (y * img.width + x) * 4;
          const lum = getLum(idx);

          // If explicit edge detected
          if (Math.abs(lum - lastLum) > scanThreshold) {
            yScore[y]++; // Vote for this Y row
          }
          lastLum = lum;
        }
      }

      // Filter Peaks
      // Balanced Setting: Ignore text/noise (<30px), catch structures.
      const MIN_LINE_LENGTH = 30;

      for (let x = 0; x < img.width; x++) {
        if (xScore[x] > MIN_LINE_LENGTH) xSet.add(x);
      }
      for (let y = 0; y < img.height; y++) {
        if (yScore[y] > MIN_LINE_LENGTH) ySet.add(y);
      }

      // Always include bounds and center
      xSet.add(0); xSet.add(img.width); xSet.add(Math.floor(img.width / 2));
      ySet.add(0); ySet.add(img.height); ySet.add(Math.floor(img.height / 2));

      console.log(`Deep Scan COMMIT: X=${xSet.size} Y=${ySet.size} (Thresh: ${scanThreshold})`);
      setEdges({ x: [...xSet], y: [...ySet] });
    };
  }, [image, scanThreshold]);

  // --- Snapping ---
  const getS_X = (val) => {
    if (!snap || !edges.x.length || !imgSize.w) return { v: val, s: false };
    const thresh = 20 / view.scale; // Stronger Magnet (was 10)
    for (const e of edges.x) {
      if (Math.abs(val - e) < thresh) return { v: e, s: true };
    }
    return { v: val, s: false };
  };

  const getS_Y = (val) => {
    if (!snap || !edges.y.length || !imgSize.w) return { v: val, s: false };
    const thresh = 20 / view.scale; // Stronger Magnet
    for (const e of edges.y) {
      if (Math.abs(val - e) < thresh) return { v: e, s: true };
    }
    return { v: val, s: false };
  };

  // --- Interaction Handlers ---
  // --- Advanced Math: Rotated Resize ---
  const rotatePoint = (px, py, cx, cy, angle) => {
    const rad = (Math.PI / 180) * angle;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = px - cx;
    const dy = py - cy;
    return {
      x: cos * dx - sin * dy + cx,
      y: sin * dx + cos * dy + cy,
    };
  };

  const handleMouseDown = (e) => {
    if (e.button === 1 || isSpacePressed) {
      e.preventDefault();
      setState({ active: true, type: 'PAN', startX: e.clientX, startY: e.clientY, snapshot: { ...view } });
      return;
    }

    if (!image) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const c = toCanvas(e.clientX - rect.left, e.clientY - rect.top);

    // Hit Testing
    // Priority 1: Handles
    const selObj = selectedId === 'master' ? master : slices.find(s => s.id === selectedId);
    if (selObj) {
      const h = (selectedId === 'master' ? selObj.w / (resolution.w / resolution.h) : selObj.h);
      const invScale = 1 / view.scale;
      const hitDist = 20 * invScale;

      // Object Bounds in Local Space (Unrotated)
      const x1 = selObj.x, y1 = selObj.y, x2 = x1 + selObj.w, y2 = y1 + h;
      const cx = x1 + selObj.w / 2, cy = y1 + h / 2;

      // Transform Mouse to Local Space
      const localM = rotatePoint(c.x, c.y, cx, cy, -selObj.rotation);

      // Check Rotate Handle (visually placed above top center)
      if (Math.abs(localM.x - cx) < hitDist && Math.abs(localM.y - (y1 - 36 * invScale)) < hitDist) {
        pushHistory();
        setState({ active: true, type: 'ROTATE', originX: c.x, originY: c.y, snapshot: { ...selObj }, historySaved: true });
        return;
      }

      // Check 8 Handles
      const handles = [
        { id: 'nw', x: x1, y: y1 }, { id: 'n', x: cx, y: y1 }, { id: 'ne', x: x2, y: y1 },
        { id: 'e', x: x2, y: cy }, { id: 'se', x: x2, y: y2 }, { id: 's', x: cx, y: y2 },
        { id: 'sw', x: x1, y: y2 }, { id: 'w', x: x1, y: cy }
      ];

      for (const hand of handles) {
        if (Math.abs(localM.x - hand.x) < hitDist && Math.abs(localM.y - hand.y) < hitDist) {
          pushHistory();
          setState({
            active: true, type: 'RESIZE', handle: hand.id,
            originX: c.x, originY: c.y,
            snapshot: { ...selObj },
            startLocal: localM, // Store initial mouse in local space
            historySaved: true
          });
          return;
        }
      }
    }

    // Priority 2: Slices Body
    const hitSlice = [...slices].reverse().find(s => {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      const lm = rotatePoint(c.x, c.y, cx, cy, -s.rotation);
      return lm.x >= s.x && lm.x <= s.x + s.w && lm.y >= s.y && lm.y <= s.y + s.h;
    });

    if (hitSlice) {
      setSelectedId(hitSlice.id);
      pushHistory();
      setState({ active: true, type: 'MOVE', originX: c.x - hitSlice.x, originY: c.y - hitSlice.y, snapshot: { ...hitSlice }, historySaved: true });
      return;
    }

    // Priority 3: Draw
    if (mode === 'slice') {
      const sx = getS_X(c.x); const sy = getS_Y(c.y);
      setState({
        active: true, type: 'DRAW',
        originX: sx.v, originY: sy.v,
        historySaved: false,
        tempRect: { x: sx.v, y: sy.v, w: 0, h: 0 }
      });
      return;
    }

    // Priority 4: Master Body
    const mh = master.w / (resolution.w / resolution.h);
    const mcx = master.x + master.w / 2, mcy = master.y + mh / 2;
    const lmm = rotatePoint(c.x, c.y, mcx, mcy, -master.rotation);
    if (lmm.x >= master.x && lmm.x <= master.x + master.w && lmm.y >= master.y && lmm.y <= master.y + mh) {
      setSelectedId('master');
      pushHistory();
      setState({ active: true, type: 'MOVE', originX: c.x - master.x, originY: c.y - master.y, snapshot: { ...master }, historySaved: true });
    } else {
      setSelectedId('master');
    }
  };

  const handleMouseMove = (e) => {
    if (!state.active) return;
    const isShift = e.shiftKey;
    const isCtrl = e.ctrlKey || e.metaKey;

    if (state.type === 'PAN') {
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      setView({ ...state.snapshot, x: state.snapshot.x + dx, y: state.snapshot.y + dy });
      return;
    }

    const rect = viewportRef.current.getBoundingClientRect();
    const c = toCanvas(e.clientX - rect.left, e.clientY - rect.top);
    let hudText = "";

    if (state.type === 'DRAW') {
      const sx = getS_X(c.x);
      const sy = getS_Y(c.y);
      setGuides({ x: sx.s ? sx.v : null, y: sy.s ? sy.v : null });

      const w = Math.abs(sx.v - state.originX);
      const h = Math.abs(sy.v - state.originY);

      // Update Temp Rect
      const tx = Math.min(state.originX, sx.v);
      const ty = Math.min(state.originY, sy.v);
      setState(prev => ({ ...prev, tempRect: { x: tx, y: ty, w, h } }));

      const mapped = mapToOut({ w, h, x: 0, y: 0 });
      hudText = `W: ${mapped.w} px\nH: ${mapped.h} px`;
    } else {
      if (state.type === 'MOVE') {
        const rawNx = c.x - state.originX;
        const rawNy = c.y - state.originY;
        const sx = getS_X(rawNx); const sy = getS_Y(rawNy);
        setGuides({ x: sx.s ? sx.v : null, y: sy.s ? sy.v : null });
        const nx = sx.v; const ny = sy.v;

        if (selectedId === 'master') setMaster(v => ({ ...v, x: nx, y: ny }));
        else setSlices(v => v.map(s => s.id === selectedId ? { ...s, x: nx, y: ny } : s));

        // HUD in Projector Coords
        const mapped = mapToOut({ x: nx, y: ny, w: 0, h: 0 }); // Just for display
        hudText = `X: ${mapped.x}\nY: ${mapped.y}`;
      }
      else if (state.type === 'RESIZE') {
        const s = state.snapshot;
        const currentAspect = resolution.w / resolution.h;
        const h = selectedId === 'master' ? s.w / currentAspect : s.h;

        // Current Mouse in Original Local Space
        const cx = s.x + s.w / 2;
        const cy = s.y + h / 2;
        const curLocal = rotatePoint(c.x, c.y, cx, cy, -s.rotation);

        let dx = curLocal.x - state.startLocal.x;
        let dy = curLocal.y - state.startLocal.y;

        if (isCtrl) { dx *= 2; dy *= 2; } // Center scale (skip snap for center scale for now to keep simple)

        let newX = s.x, newY = s.y, newW = s.w, newH = h;
        const hid = state.handle;

        // 1. Apply Delta
        if (hid.includes('e')) newW += dx;
        if (hid.includes('w')) { newX += dx; newW -= dx; }
        if (hid.includes('s')) newH += dy;
        if (hid.includes('n')) { newY += dy; newH -= dy; }

        // 2. SNAP Logic for RESIZE
        let gx = null, gy = null;

        if (!isCtrl && !isShift && s.rotation === 0) { // Only snap if not rotated/ratio-locked (too complex otherwise)
          if (hid.includes('w')) {
            const snapRes = getS_X(newX);
            if (snapRes.s) { newW += (newX - snapRes.v); newX = snapRes.v; gx = snapRes.v; }
          }
          if (hid.includes('e')) {
            const snapRes = getS_X(newX + newW);
            if (snapRes.s) { newW = snapRes.v - newX; gx = snapRes.v; }
          }
          if (hid.includes('n')) {
            const snapRes = getS_Y(newY);
            if (snapRes.s) { newH += (newY - snapRes.v); newY = snapRes.v; gy = snapRes.v; }
          }
          if (hid.includes('s')) {
            const snapRes = getS_Y(newY + newH);
            if (snapRes.s) { newH = snapRes.v - newY; gy = snapRes.v; }
          }
        }
        setGuides({ x: gx, y: gy });

        if (isShift) {
          // ... keep shift logic (skip snap if shift)
          const ratio = s.w / h;
          if (hid.length === 2) {
            if (Math.abs(newW / ratio) > Math.abs(newH)) newH = newW / ratio;
            else newW = newH * ratio;
            if (hid.includes('w')) newX = s.x + s.w - newW;
            if (hid.includes('n')) newY = s.y + h - newH;
          }
        }

        if (newW < 10) newW = 10;
        if (newH < 10) newH = 10;

        // Re-center rotation pivot logic (Simplified: Center Shift)
        const newCxLocal = newX + newW / 2;
        const newCyLocal = newY + newH / 2;
        const dcx = newCxLocal - (s.x + s.w / 2);
        const dcy = newCyLocal - (s.y + h / 2);

        // Rotate offset to World
        const dWorld = rotatePoint(dcx, dcy, 0, 0, s.rotation);

        // Old Center World
        const oldCxWorld = s.x + s.w / 2;
        const oldCyWorld = s.y + h / 2;

        const finalCx = oldCxWorld + dWorld.x;
        const finalCy = oldCyWorld + dWorld.y;

        const finalX = finalCx - newW / 2;
        const finalY = finalCy - newH / 2;

        const update = { x: finalX, y: finalY, w: newW, h: newH };

        if (selectedId === 'master') {
          // Master usually locked aspect
          const currentAspect = resolution.w / resolution.h;
          const fixedH = update.w / currentAspect;
          update.y = finalCy - fixedH / 2;
          update.h = fixedH;
          setMaster(v => ({ ...v, ...update }));
        }
        else setSlices(v => v.map(sl => sl.id === selectedId ? { ...sl, ...update } : sl));

        const mapped = mapToOut(update);
        hudText = `W: ${mapped.w}\nH: ${mapped.h}`;
      }
      else if (state.type === 'ROTATE') {
        const o = state.snapshot;
        const cx = o.x + o.w / 2;
        const cy = o.y + (o.h || o.w / (resolution.w / resolution.h)) / 2;
        const ang = Math.atan2(c.y - cy, c.x - cx) * 180 / Math.PI + 90;
        const finalAng = isShift ? Math.round(ang / 15) * 15 : ang;

        if (selectedId === 'master') setMaster(v => ({ ...v, rotation: finalAng }));
        else setSlices(v => v.map(s => s.id === selectedId ? { ...s, rotation: finalAng } : s));
        hudText = `∠ ${Math.round(finalAng)}°`;
      }
    }
    if (hudText) setCursorHUD({ x: e.clientX, y: e.clientY, text: hudText });
  };

  const handleMouseUp = (e) => {
    if (state.type === 'DRAW') {
      const rect = viewportRef.current.getBoundingClientRect();
      const c = toCanvas(e.clientX - rect.left, e.clientY - rect.top);
      const ex = getS_X(c.x).v; const ey = getS_Y(c.y).v;
      const w = Math.abs(ex - state.originX);
      const h = Math.abs(ey - state.originY);

      if (w > 5 && h > 5) {
        const id = Date.now();
        setSlices(v => [...v, { id, x: Math.min(state.originX, ex), y: Math.min(state.originY, ey), w, h, rotation: 0 }]);
        setSelectedId(id);
      } else {
        // Cancelled draw, maybe pop history? Not impactful.
      }
    }
    setState({ active: false, type: null });
    setGuides({ x: null, y: null });
    setCursorHUD(null);
  };



  const mapToOut = (s) => {
    const mh = master.w / (resolution.w / resolution.h);
    return {
      x: Math.round(((s.x - master.x) / master.w) * resolution.w),
      y: Math.round(((s.y - master.y) / mh) * resolution.h),
      w: Math.round((s.w / master.w) * resolution.w),
      h: Math.round((s.h / mh) * resolution.h)
    };
  };

  const renderHandles = (obj, isM) => {
    const invScale = 1 / view.scale;
    const h = isM ? obj.w / (resolution.w / resolution.h) : obj.h;

    // 8 Cardinal Handles (Percentages)
    const handles = [
      { id: 'nw', x: 0, y: 0, c: 'nwse-resize' },
      { id: 'n', x: 50, y: 0, c: 'ns-resize' },
      { id: 'ne', x: 100, y: 0, c: 'nesw-resize' },
      { id: 'e', x: 100, y: 50, c: 'ew-resize' },
      { id: 'se', x: 100, y: 100, c: 'nwse-resize' },
      { id: 's', x: 50, y: 100, c: 'ns-resize' },
      { id: 'sw', x: 0, y: 100, c: 'nesw-resize' },
      { id: 'w', x: 0, y: 50, c: 'ew-resize' }
    ];

    return (
      <div style={{ position: 'absolute', top: obj.y, left: obj.x, width: obj.w, height: h, transform: `rotate(${obj.rotation}deg)`, pointerEvents: 'none' }}>
        <div className={`selection-box ${isM ? '' : 'slice'}`} style={{ width: '100%', height: '100%' }} />

        {handles.map(hand => (
          <div key={hand.id} className="hit-zone" style={{
            left: `${hand.x}%`, top: `${hand.y}%`,
            transform: 'translate(-50%, -50%)',
            cursor: hand.c,
            width: 16 * invScale, height: 16 * invScale
          }}>
            <div className="visual-node" style={{ width: 6 * invScale, height: 6 * invScale, borderWidth: 1 * invScale, background: '#fff' }} />
          </div>
        ))}

        {/* Rotate */}
        <div className="hit-zone cursor-rotate" style={{ top: -36 * invScale, left: '50%', transform: 'translateX(-50%)', width: 24 * invScale, height: 24 * invScale }}>
          <div className="visual-node rotate-node" style={{ width: 8 * invScale, height: 8 * invScale, borderWidth: 1.5 * invScale }} />
          <div className="rotate-line" style={{ height: 16 * invScale, width: 1.5 * invScale, top: 8 * invScale }} />
        </div>
      </div>
    );
  };

  /* Drag & Drop Support */
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) {
      const r = new FileReader();
      r.onload = x => setImage(x.target.result);
      r.readAsDataURL(f);
    }
  };

  return (
    <div className="master-app">
      {cursorHUD && <div className="ghost-hud" style={{ left: cursorHUD.x, top: cursorHUD.y }}>{cursorHUD.text}</div>}

      <header className="master-toolbar">
        <div className="brand-section" onClick={() => window.location.reload()} style={{ cursor: 'pointer' }}>
          <Monitor className="text-teal-400" size={20} color="#64FFDA" />
          <div><h1 className="brand-title">Stage Snapper</h1><span className="brand-tag">MASTER v5.1</span></div>
        </div>

        <div className="toolbar-controls">
          <button className={`btn-icon ${mode === 'layout' ? 'active' : ''}`} onClick={() => setMode('layout')} title="Layout Mode"><Move size={18} /></button>
          <button className={`btn-icon ${mode === 'slice' ? 'active' : ''}`} onClick={() => setMode('slice')} title="Slice Mode"><Crop size={18} /></button>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          <button className="btn-icon" onClick={undo} title="Undo [Ctrl+Z]"><Undo size={18} /></button>
          <button className="btn-icon" onClick={redo} title="Redo [Ctrl+Y]"><Redo size={18} /></button>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          <button className={`btn-icon ${snap ? 'active' : ''}`} onClick={() => setSnap(!snap)} title="Toggle Snapping [S]">
            {snap ? <Lock size={18} /> : <Unlock size={18} />}
          </button>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          <button className="btn-icon" onClick={() => setView(v => ({ ...v, scale: v.scale * 1.2 }))}><Plus size={18} /></button>
          <span style={{ fontSize: 12, width: 40, textAlign: 'center', fontFamily: 'JetBrains Mono', color: '#64FFDA' }}>{Math.round(view.scale * 100)}%</span>
          <button className="btn-icon" onClick={() => setView(v => ({ ...v, scale: v.scale / 1.2 }))}><Minus size={18} /></button>
        </div>

        <div className="toolbar-controls">
          <button className="btn-primary" onClick={() => alert(JSON.stringify(slices.map(mapToOut)))}><Download size={16} /> EXPORT JSON</button>
        </div>
      </header>

      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <Box size={24} color="#4CECB4" style={{ marginRight: 10 }} />
          <h3 style={{ margin: 0, fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => window.location.reload()}>STAGE SNAPPER</h3>
        </div>

        <div className="item-header"><h4 style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Projector</h4></div>
        <div className="control-group">
          <label>Resolution</label>
          <select style={{ width: '100%', marginBottom: 10, background: '#333', color: '#fff', border: '1px solid #444', padding: 4 }}
            value={`${resolution.w}x${resolution.h}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              if (w) setResolution({ w, h });
            }}
          >
            <option value="1920x1200">WUXGA (1920 x 1200)</option>
            <option value="1920x1080">FHD (1920 x 1080)</option>
            <option value="3840x2160">4K (3840 x 2160)</option>
            <option value="CUSTOM">Custom...</option>
          </select>
          <div style={{ display: 'flex', gap: 5 }}>
            <input type="number" value={resolution.w} onChange={e => setResolution(v => ({ ...v, w: parseInt(e.target.value) }))} style={{ width: '50%', background: '#222', border: '1px solid #444', color: '#fff', padding: 4 }} />
            <span style={{ color: '#666' }}>x</span>
            <input type="number" value={resolution.h} onChange={e => setResolution(v => ({ ...v, h: parseInt(e.target.value) }))} style={{ width: '50%', background: '#222', border: '1px solid #444', color: '#fff', padding: 4 }} />
          </div>
          <div style={{ fontSize: 9, color: '#666', marginTop: 4, textAlign: 'right' }}>
            Aspect: {(resolution.w / resolution.h).toFixed(2)}
          </div>
        </div>

        <div className="item-header"><h4 style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Analysis</h4></div>

        <div className="control-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label>Scan Threshold</label>
            <button className="btn-icon" style={{ width: 20, height: 20, padding: 0, border: 'none' }} onClick={() => setShowLines(!showLines)} title="Toggle Scan Lines">
              {showLines ? <Eye size={14} color="#64FFDA" /> : <EyeOff size={14} color="#666" />}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min="1" max="255" value={scanThreshold} onChange={e => setScanThreshold(parseInt(e.target.value))} style={{ width: 80 }} />
            <span className="val">{scanThreshold}</span>
          </div>
          <div style={{ fontSize: 9, color: '#666', marginTop: 4, textAlign: 'right' }}>
            Detected: X:{edges.x.length} Y:{edges.y.length}
          </div>
        </div>

        <div className="item-header" style={{ marginTop: 16 }}><h4 style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Properties</h4></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={() => {
            const data = JSON.stringify({ master, slices }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'stage_map.json'; a.click();
          }}>
            <FileJson size={14} /> JSON
          </button>
          <button className="btn-primary" style={{ justifyContent: 'center', background: '#FF9800', color: '#000' }} onClick={exportResolumeXML}>
            <FileJson size={14} /> XML
          </button>

          <button className="btn-icon" style={{ borderColor: '#ff4444', color: '#ff4444', width: '100%', gridColumn: 'span 2' }} onClick={() => {
            if (confirm('Clear all slices?')) setSlices([]);
          }} title="Clear All Slices">
            <Trash2 size={16} /> CLEAR ALL
          </button>
        </div>

        <div className="item-header" style={{ marginTop: 16 }}><h4 style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Slices</h4></div>
        <div className="slice-list">
          {slices.map((s, i) => {
            const m = mapToOut(s);
            const update = (key, val) => {
              setSlices(prev => prev.map(raw => {
                if (raw.id !== s.id) return raw;
                const next = { ...raw };
                if (key === 'x') next.x += val;
                if (key === 'y') next.y += val;
                if (key === 'w') next.w += val;
                if (key === 'h') next.h += val;
                if (key === 'rotation') next.rotation += val;
                return next;
              }));
            };
            return (
              <div key={s.id} className={`item-card ${selectedId === s.id ? 'selected' : ''}`} onClick={() => setSelectedId(s.id)}>
                <div className="item-header"><h4>Slice {i + 1}</h4><span onClick={(e) => { e.stopPropagation(); setSlices(v => v.filter(x => x.id !== s.id)); setSelectedId('master') }} style={{ color: '#ff4444', cursor: 'pointer' }}>✕</span></div>

                <div className="prop-row">
                  <label>X</label>
                  <button className="btn-tiny" onClick={() => update('x', -0.5)}>-</button>
                  <span className="val">{m.x}</span>
                  <button className="btn-tiny" onClick={() => update('x', 0.5)}>+</button>
                </div>
                <div className="prop-row">
                  <label>Y</label>
                  <button className="btn-tiny" onClick={() => update('y', -0.5)}>-</button>
                  <span className="val">{m.y}</span>
                  <button className="btn-tiny" onClick={() => update('y', 0.5)}>+</button>
                </div>
                <div className="prop-row">
                  <label>W</label>
                  <button className="btn-tiny" onClick={() => update('w', -1)}>-</button>
                  <span className="val">{m.w}</span>
                  <button className="btn-tiny" onClick={() => update('w', 1)}>+</button>
                </div>
                <div className="prop-row">
                  <label>H</label>
                  <button className="btn-tiny" onClick={() => update('h', -1)}>-</button>
                  <span className="val">{m.h}</span>
                  <button className="btn-tiny" onClick={() => update('h', 1)}>+</button>
                </div>
                <div className="prop-row">
                  <label>R</label>
                  <button className="btn-tiny" onClick={() => update('rotation', -1)}>-</button>
                  <span className="val">{Math.round(s.rotation)}°</span>
                  <button className="btn-tiny" onClick={() => update('rotation', 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <main className="viewport"
        ref={viewportRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{ cursor: isSpacePressed || state.type === 'PAN' ? 'grab' : 'default' }}
      >
        {!image && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
            <p style={{ color: '#64FFDA', marginBottom: 16, fontSize: '1.2rem' }}>PASTE IMAGE (Ctrl+V) or DROP HERE</p>
            <button className="btn-primary" onClick={() => document.getElementById('u').click()}><Search size={16} /> BROWSE FILE</button>
            <input id="u" type="file" hidden onChange={e => {
              const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = x => setImage(x.target.result); r.readAsDataURL(f); }
            }} />
          </div>
        )}

        {image && (
          <div className="canvas-root" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
            <img src={image} className="stage-image" alt="stage" style={{ pointerEvents: 'none', zIndex: 0 }} />

            {/* Debug: Red Scan Lines (User Requested) */}
            {showLines && edges.x.length > 0 && (
              <>
                {edges.x.map(x => <div key={'x' + x} style={{ position: 'absolute', left: x, top: 0, height: '100%', width: 1, background: 'rgba(255, 0, 0, 0.3)', pointerEvents: 'none', zIndex: 1 }} />)}
                {edges.y.map(y => <div key={'y' + y} style={{ position: 'absolute', top: y, left: 0, width: '100%', height: 1, background: 'rgba(255, 0, 0, 0.3)', pointerEvents: 'none', zIndex: 1 }} />)}
              </>
            )}

            {/* Active Snap Guides (Cyan Lines) */}
            {guides.x && (
              <>
                <div className="ref-line" style={{ width: Math.max(1, 2 / view.scale), height: '10000%', left: guides.x, top: '-5000%', zIndex: 9999, background: '#00E5FF', boxShadow: `0 0 ${10 / view.scale}px #00E5FF` }} />
                <div style={{ position: 'absolute', left: guides.x, top: (state.tempRect ? state.tempRect.y + state.tempRect.h : 0), width: 10 / view.scale, height: 10 / view.scale, borderRadius: '50%', background: '#00E5FF', transform: `translate(${-5 / view.scale}px, ${-5 / view.scale}px)`, zIndex: 10000 }} />
              </>
            )}
            {guides.y && (
              <>
                <div className="ref-line" style={{ height: Math.max(1, 2 / view.scale), width: '10000%', top: guides.y, left: '-5000%', zIndex: 9999, background: '#00E5FF', boxShadow: `0 0 ${10 / view.scale}px #00E5FF` }} />
                <div style={{ position: 'absolute', top: guides.y, left: (state.tempRect ? state.tempRect.x + state.tempRect.w : 0), width: 10 / view.scale, height: 10 / view.scale, borderRadius: '50%', background: '#00E5FF', transform: `translate(${-5 / view.scale}px, ${-5 / view.scale}px)`, zIndex: 10000 }} />
              </>
            )}

            <div className="master-frame-visual" style={{
              left: master.x, top: master.y, width: master.w, height: master.w / (resolution.w / resolution.h),
              transform: `rotate(${master.rotation}deg)`,
              zIndex: 5
            }} />

            {slices.map(s => (
              <div key={s.id} className={`slice-obj ${selectedId === s.id ? 'active' : ''}`}
                style={{ left: s.x, top: s.y, width: s.w, height: s.h, transform: `rotate(${s.rotation}deg)`, zIndex: 10 }} />
            ))}

            {/* Live Draw Visual - High Visibility */}
            {state.type === 'DRAW' && state.tempRect && (
              <div className="slice-obj drawing" style={{
                left: state.tempRect.x, top: state.tempRect.y,
                width: state.tempRect.w, height: state.tempRect.h,
                border: '2px dashed #4CECB4',
                backgroundColor: 'rgba(76, 236, 180, 0.2)',
                boxShadow: '0 0 10px rgba(76, 236, 180, 0.5)',
                pointerEvents: 'none',
                zIndex: 9999, // Force Top
                position: 'absolute'
              }} />
            )}

            {selectedId === 'master' && renderHandles(master, true)}
            {selectedId !== 'master' && slices.find(s => s.id === selectedId) && renderHandles(slices.find(s => s.id === selectedId), false)}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
