// js/canvas.js
import { state, setGridData, BASE_CELL_SIZE } from './state.js';
import { rgbFromHex, findClosestPaletteColor, initGridData } from './utils.js';
import { updateStatsWithSort } from './stats.js';

const ERASE_COLOR = '#FFFFFF';
const LONG_PRESS_DURATION = 500;
const MOVE_THRESHOLD = 10;

let longPressTimer = null;
let touchStartX = 0, touchStartY = 0;
let hasMoved = false;
let longPressTriggered = false;
let eventsBound = false;

export function initCanvas() {
    state.canvas = document.getElementById('pixelCanvas');
    if (!state.canvas) return;
    state.ctx = state.canvas.getContext('2d');
    if (!state.ctx) return;
    resizeCanvas(state.gridWidth, state.gridHeight);
    if (!eventsBound) {
        bindCanvasEvents();
        eventsBound = true;
    }
}

export function resizeCanvas(width, height) {
    if (!state.canvas) return;
    state.gridWidth = width;
    state.gridHeight = height;
    state.canvas.width = width * BASE_CELL_SIZE;
    state.canvas.height = height * BASE_CELL_SIZE;
    state.canvas.style.width = '100%';
    state.canvas.style.height = 'auto';
    setGridData(initGridData(width, height), true);
    drawFullGrid();
}

function bindCanvasEvents() {
    const canvas = state.canvas;
    if (!canvas) return;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
}

function onMouseDown(e) {
    // 替换模式下禁止绘制和吸取
    if (state.replaceModeActive) return;
    e.preventDefault();
    if (e.button === 0) {
        state.isDrawing = true;
        handleDraw(e);
    } else if (e.button === 2) {
        pickColorFromEvent(e);
    }
}

function onMouseMove(e) {
    if (state.replaceModeActive) return;
    handleDraw(e);
}
function onMouseUp() { state.isDrawing = false; }
function onMouseLeave() { state.isDrawing = false; }

function onTouchStart(e) {
    // 替换模式下禁止绘制和吸取
    if (state.replaceModeActive) return;
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    hasMoved = false;
    longPressTriggered = false;
    state.isDrawing = true;
    clearLongPressTimer();
    longPressTimer = setTimeout(() => {
        longPressTriggered = true;
        pickColorFromEvent({ clientX: touchStartX, clientY: touchStartY });
        state.isDrawing = false;
    }, LONG_PRESS_DURATION);
}

function onTouchMove(e) {
    if (state.replaceModeActive) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);
    if (dx >= MOVE_THRESHOLD || dy >= MOVE_THRESHOLD) {
        hasMoved = true;
        state.isDrawing = false;
        clearLongPressTimer();
        return;
    }
    e.preventDefault();
    if (longPressTriggered || !state.isDrawing) return;
    handleDraw({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} });
}

function onTouchEnd(e) {
    if (state.replaceModeActive) return;
    e.preventDefault();
    clearLongPressTimer();
    if (!hasMoved && !longPressTriggered) {
        const wasDrawing = state.isDrawing;
        state.isDrawing = true;
        handleDraw({ clientX: touchStartX, clientY: touchStartY, preventDefault: () => {} });
        state.isDrawing = wasDrawing;
    }
    state.isDrawing = false;
    hasMoved = false;
    longPressTriggered = false;
}

function clearLongPressTimer() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

export function getCanvasPoint(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

export function getGridCellFromPoint(x, y, cellSize = BASE_CELL_SIZE) {
    return { col: Math.floor(x / cellSize), row: Math.floor(y / cellSize) };
}

export function isValidCell(row, col) {
    return row >= 0 && row < state.gridHeight && col >= 0 && col < state.gridWidth;
}

function pickColorFromEvent(e) {
    if (!state.canvas || !state.gridData?.length) return;
    const point = getCanvasPoint(state.canvas, e.clientX, e.clientY);
    const { row, col } = getGridCellFromPoint(point.x, point.y);
    if (isValidCell(row, col)) {
        state.currentColor = state.gridData[row][col];
    }
}

function resolveDrawColor() {
    if (state.currentMode === 'brush') {
        return findClosestPaletteColor(state.currentColor);
    }
    return ERASE_COLOR;
}

function handleDraw(e) {
    if (state.replaceModeActive) return; // 替换模式下禁止绘制
    if (state.clearModeActive || !state.isDrawing || !state.canvas) return;
    e.preventDefault?.();
    const point = getCanvasPoint(state.canvas, e.clientX, e.clientY);
    const { row, col } = getGridCellFromPoint(point.x, point.y);
    if (!isValidCell(row, col)) return;
    const newColor = resolveDrawColor();
    if (state.gridData[row][col] === newColor) return;
    // 更新一个单元格
    const newGrid = state.gridData.map(rowArr => [...rowArr]);
    newGrid[row][col] = newColor;
    setGridData(newGrid);
    drawCell(row, col);
}

export function drawCell(row, col) {
    if (!state.ctx || !isValidCell(row, col)) return;
    const ctx = state.ctx;
    const x = col * BASE_CELL_SIZE;
    const y = row * BASE_CELL_SIZE;
    const size = BASE_CELL_SIZE;
    ctx.fillStyle = state.gridData[row][col];
    ctx.fillRect(x, y, size, size);
    drawCellBorder(ctx, row, col);
    if (state.showColorNames) {
        drawCellColorName(ctx, row, col);
    }
}

function drawCellBorder(ctx, row, col) {
    const x = col * BASE_CELL_SIZE;
    const y = row * BASE_CELL_SIZE;
    const size = BASE_CELL_SIZE;
    ctx.strokeStyle = '#c0b6a8';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, size, size);
    if (row === 0 || col === 0 || row === state.gridHeight - 1 || col === state.gridWidth - 1) {
        ctx.strokeStyle = '#9a8b7c';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, 0, state.canvas.width, state.canvas.height);
    }
}

export function drawFullGrid() {
    if (!state.canvas || !state.ctx || !state.gridData?.length) return;
    const ctx = state.ctx;
    ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    for (let row = 0; row < state.gridHeight; row++) {
        for (let col = 0; col < state.gridWidth; col++) {
            ctx.fillStyle = state.gridData[row][col];
            ctx.fillRect(col * BASE_CELL_SIZE, row * BASE_CELL_SIZE, BASE_CELL_SIZE, BASE_CELL_SIZE);
        }
    }
    drawGridLines(ctx);
    if (state.showColorNames) {
        drawColorNames(ctx);
    }
}

function drawGridLines(ctx) {
    ctx.beginPath();
    ctx.strokeStyle = '#c0b6a8';
    ctx.lineWidth = 0.8;
    for (let i = 0; i <= state.gridWidth; i++) {
        ctx.moveTo(i * BASE_CELL_SIZE, 0);
        ctx.lineTo(i * BASE_CELL_SIZE, state.canvas.height);
    }
    for (let i = 0; i <= state.gridHeight; i++) {
        ctx.moveTo(0, i * BASE_CELL_SIZE);
        ctx.lineTo(state.canvas.width, i * BASE_CELL_SIZE);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = '#9a8b7c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, state.canvas.width, state.canvas.height);
}

export function getTextColorByHex(hex) {
    const { r, g, b } = rgbFromHex(hex);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 186 ? '#000000' : '#FFFFFF';
}

function drawCellColorName(ctx, row, col) {
    const hex = state.gridData[row][col];
    const name = state.hexToNameMap.get(hex.toUpperCase());
    if (!name || name === '空白') return;
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = getTextColorByHex(hex);
    const x = col * BASE_CELL_SIZE + BASE_CELL_SIZE / 2;
    const y = row * BASE_CELL_SIZE + BASE_CELL_SIZE / 2;
    ctx.fillText(name, x, y);
}

function drawColorNames(ctx) {
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < state.gridHeight; row++) {
        for (let col = 0; col < state.gridWidth; col++) {
            const hex = state.gridData[row][col];
            const name = state.hexToNameMap.get(hex.toUpperCase());
            if (!name || name === '空白') continue;
            ctx.fillStyle = getTextColorByHex(hex);
            const x = col * BASE_CELL_SIZE + BASE_CELL_SIZE / 2;
            const y = row * BASE_CELL_SIZE + BASE_CELL_SIZE / 2;
            ctx.fillText(name, x, y);
        }
    }
}

export function clearCanvas() {
    setGridData(initGridData(state.gridWidth, state.gridHeight));
}