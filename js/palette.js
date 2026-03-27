import { state, setGridData } from './state.js';
import { rgbToHex, findClosestPaletteColor } from './utils.js';
import { updateStatsWithSort } from './stats.js';
import { drawFullGrid } from './canvas.js';
import { showToast } from './toast.js';

const PALETTE_TYPES = { full: 'paletteFull', light: 'paletteLight' };
const EMPTY_COLOR_NAME = '空白';
const BRUSH_MODE = 'brush';

function getCurrentPalette() {
    return Array.isArray(window.palette) ? window.palette : [];
}

function getHexFromItem(item) {
    if (!item || !Array.isArray(item.rgb) || item.rgb.length !== 3) return null;
    const [r, g, b] = item.rgb;
    return rgbToHex(r, g, b).toUpperCase();
}

function syncBrushModeButtons() {
    const brushBtn = document.getElementById('brushModeBtn');
    const eraserBtn = document.getElementById('eraserModeBtn');
    if (brushBtn) brushBtn.classList.add('active');
    if (eraserBtn) eraserBtn.classList.remove('active');
}

function handleSwatchClick(hex) {
    state.currentColor = hex;
    if (state.currentMode !== BRUSH_MODE) {
        state.currentMode = BRUSH_MODE;
        syncBrushModeButtons();
    }
}

function createSwatchElement(item) {
    const hex = getHexFromItem(item);
    if (!hex) return null;
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.backgroundColor = hex;
    swatch.title = `${item.name} (${hex})`;
    if (item.name === EMPTY_COLOR_NAME) {
        swatch.style.backgroundImage = 'repeating-linear-gradient(45deg, #ccc 0px, #ccc 2px, #fff 2px, #fff 8px)';
        swatch.style.border = '1px dashed #999';
    }
    swatch.addEventListener('click', () => {
        // 如果处于替换模式的第二步，将色卡点击作为目标色
        if (state.replaceModeActive && state.replaceStep === 2) {
            if (window.handleReplaceModeClick) {
                window.handleReplaceModeClick(null, null, hex);
            }
            return;
        }
        // 否则正常切换画笔颜色
        handleSwatchClick(hex);
    });
    return swatch;
}

export function initPalette() {
    const palette = getCurrentPalette();
    state.hexToNameMap.clear();
    state.nameToHexMap.clear();
    palette.forEach(item => {
        const hex = getHexFromItem(item);
        if (!hex || !item?.name) return;
        state.hexToNameMap.set(hex, item.name);
        state.nameToHexMap.set(item.name, hex);
    });
}

export function renderPaletteGrid(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const palette = getCurrentPalette();
    container.innerHTML = '';
    if (palette.length === 0) return;
    const fragment = document.createDocumentFragment();
    palette.forEach(item => {
        const swatch = createSwatchElement(item);
        if (swatch) fragment.appendChild(swatch);
    });
    container.appendChild(fragment);
}

export function switchPalette(type) {
    const key = PALETTE_TYPES[type];
    const next = key ? window[key] : null;
    if (!Array.isArray(next)) return;
    window.palette = next;
    initPalette();

    // 将画布中不在新映射表里的颜色映射到最近颜色
    let changed = false;
    const newGrid = state.gridData.map(row =>
        row.map(hex => {
            const upperHex = hex.toUpperCase();
            if (!state.hexToNameMap.has(upperHex)) {
                changed = true;
                return findClosestPaletteColor(hex);
            }
            return hex;
        })
    );
    if (changed) {
        setGridData(newGrid);
    } else {
        drawFullGrid();
        updateStatsWithSort(state.currentSort);
    }
    renderPaletteGrid('paletteGrid');
}