// js/ui.js
import { state, setGridData } from './state.js';
import { BASE_CELL_SIZE } from './state.js';
import { clearCanvas, resizeCanvas, drawFullGrid } from './canvas.js';
import { updateStatsWithSort } from './stats.js';
import { exportCanvasPNG, exportUsedPalettePNG, exportHistory, importHistory, uploadImage } from './export.js';
import { simplifyColors, clearBackground, mergeRareColors } from './simplify.js';
import { switchPalette } from './palette.js';
import { showToast } from './toast.js';

let hasShownClearBgTip = false;

// ==================== 辅助函数 ====================
function getColorName(hex) {
    return state.hexToNameMap.get(hex.toUpperCase()) || hex;
}

function isBlankColor(hex) {
    const name = getColorName(hex);
    return name === '空白';
}

// ==================== 替换颜色核心逻辑 ====================
function cancelReplaceMode() {
    state.replaceModeActive = false;
    state.replaceStep = 0;
    state.replaceSrcColor = null;
    const replaceBtn = document.getElementById('replaceColorBtn');
    if (replaceBtn) replaceBtn.classList.remove('active');
}

function performReplace(srcHex, targetHex) {
    let changed = false;
    const newGrid = state.gridData.map(row => [...row]);
    for (let row = 0; row < state.gridHeight; row++) {
        for (let col = 0; col < state.gridWidth; col++) {
            if (newGrid[row][col] === srcHex) {
                newGrid[row][col] = targetHex;
                changed = true;
            }
        }
    }
    if (changed) {
        setGridData(newGrid);
        showToast(`已将所有 ${getColorName(srcHex)} 替换为 ${getColorName(targetHex)}`, 2000);
    } else {
        showToast('没有找到需要替换的颜色', 1500);
    }
}

export function handleReplaceModeClick(row, col, hex) {
    if (!state.replaceModeActive) return false;

    if (state.replaceStep === 1) {
        if (isBlankColor(hex)) {
            showToast('不能替换空白颜色，请选择其他颜色', 1500);
            return true;
        }
        state.replaceSrcColor = hex;
        state.replaceStep = 2;
        showToast(`已选择要替换的颜色：${getColorName(hex)}，请点击目标颜色（画布或色卡）`, 2000);
        return true;
    } 
    else if (state.replaceStep === 2) {
        if (isBlankColor(hex)) {
            showToast('不能替换为空白颜色，请选择其他颜色', 1500);
            return true;
        }
        const srcColor = state.replaceSrcColor;
        const targetColor = hex;
        if (srcColor === targetColor) {
            showToast('源颜色与目标颜色相同，无需替换', 1500);
            cancelReplaceMode();
            return true;
        }
        performReplace(srcColor, targetColor);
        cancelReplaceMode();
        return true;
    }
    return false;
}
window.handleReplaceModeClick = handleReplaceModeClick;

// ==================== 通用 UI 函数 ====================
export function parsePositiveInteger(value) {
    if (value === null || value === undefined) return null;
    const num = parseInt(String(value).trim(), 10);
    if (isNaN(num) || num < 1) return null;
    return num;
}

export function requestPositiveInteger(message, defaultValue = '1') {
    const input = prompt(message, defaultValue);
    if (input === null) return null;
    return parsePositiveInteger(input);
}

export function setActiveClass(activeElements, inactiveElements, className = 'active') {
    activeElements.forEach(el => el?.classList.add(className));
    inactiveElements.forEach(el => el?.classList.remove(className));
}

export function getCanvasCellFromEvent(event, canvas, cellSize) {
    if (!event || !canvas || !cellSize) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
        clientX = event.clientX;
        clientY = event.clientY;
    } else return null;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;
    return { col: Math.floor(canvasX / cellSize), row: Math.floor(canvasY / cellSize) };
}

export function isCellInGrid(row, col, gridWidth, gridHeight) {
    return row >= 0 && row < gridHeight && col >= 0 && col < gridWidth;
}

export function bindFileImport(triggerBtn, inputEl, handler) {
    if (!triggerBtn || !inputEl) return;
    triggerBtn.addEventListener('click', () => inputEl.click());
    inputEl.addEventListener('change', async e => {
        const file = e.target?.files?.[0];
        if (!file) return;
        await handler(file);
        inputEl.value = '';
    });
}

// ==================== 替换模式下禁用其他操作 ====================
function checkReplaceModeAndWarn() {
    if (state.replaceModeActive) {
        showToast('请先退出替换模式（再次点击替换按钮）', 1500);
        return true;
    }
    return false;
}

// ==================== UI 初始化模块 ====================
function initModeControls() {
    const brushBtn = document.getElementById('brushModeBtn');
    const eraserBtn = document.getElementById('eraserModeBtn');
    brushBtn?.addEventListener('click', () => {
        if (checkReplaceModeAndWarn()) return;
        state.currentMode = 'brush';
        setActiveClass([brushBtn], [eraserBtn], 'active');
    });
    eraserBtn?.addEventListener('click', () => {
        if (checkReplaceModeAndWarn()) return;
        state.currentMode = 'eraser';
        setActiveClass([eraserBtn], [brushBtn], 'active');
    });
}

function initCanvasControls() {
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (checkReplaceModeAndWarn()) return;
            clearCanvas();
        });
    }

    // 色号显示控制：单一按钮切换
    const toggleBtn = document.getElementById('toggleColorNamesBtn');
    if (toggleBtn) {
        const updateButtonText = () => {
            toggleBtn.textContent = state.showColorNames ? '隐藏色号' : '显示色号';
        };
        toggleBtn.addEventListener('click', () => {
            state.showColorNames = !state.showColorNames;
            updateButtonText();
            drawFullGrid();
        });
        updateButtonText();
    }

    // 画布点击事件
    const canvas = state.canvas;
    if (!canvas) return;
    const handleCanvasClick = e => {
        if (state.replaceModeActive) {
            const cell = getCanvasCellFromEvent(e, canvas, BASE_CELL_SIZE);
            if (cell && isCellInGrid(cell.row, cell.col, state.gridWidth, state.gridHeight)) {
                const clickedHex = state.gridData[cell.row][cell.col];
                handleReplaceModeClick(cell.row, cell.col, clickedHex);
            }
            return;
        }
        if (state.clearModeActive) {
            e.preventDefault();
            const cell = getCanvasCellFromEvent(e, canvas, BASE_CELL_SIZE);
            if (cell && isCellInGrid(cell.row, cell.col, state.gridWidth, state.gridHeight)) {
                clearBackground(cell.row, cell.col);
            }
            state.clearModeActive = false;
            const clearBgBtn = document.getElementById('clearBackgroundBtn');
            if (clearBgBtn) clearBgBtn.classList.remove('active');
            return;
        }
    };
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', e => {
        if (state.clearModeActive || state.replaceModeActive) {
            e.preventDefault();
            handleCanvasClick(e);
        }
    });
}

function initExportImportControls() {
    document.getElementById('exportBtn')?.addEventListener('click', exportCanvasPNG);
    document.getElementById('exportUsedPaletteBtn')?.addEventListener('click', exportUsedPalettePNG);
    document.getElementById('exportHistoryBtn')?.addEventListener('click', exportHistory);
    const importHistoryInput = document.getElementById('importHistoryInput');
    const importHistoryBtn = document.getElementById('importHistoryBtn');
    bindFileImport(importHistoryBtn, importHistoryInput, importHistory);
    const imageUploadInput = document.getElementById('imageUpload');
    const uploadBtn = document.getElementById('uploadBtn');
    bindFileImport(uploadBtn, imageUploadInput, uploadImage);
}

function initSortControls() {
    const sortCountBtn = document.getElementById('sortByCountDesc');
    const sortNameBtn = document.getElementById('sortByNameAsc');
    sortCountBtn?.addEventListener('click', () => {
        state.currentSort = 'count-desc';
        updateStatsWithSort(state.currentSort);
    });
    sortNameBtn?.addEventListener('click', () => {
        state.currentSort = 'name-asc';
        updateStatsWithSort(state.currentSort);
    });
}

function initSimplifyControls() {
    const simplifyBtn = document.getElementById('simplifyBtn');
    if (!simplifyBtn) return;
    simplifyBtn.addEventListener('click', async () => {
        if (checkReplaceModeAndWarn()) return;
        const num = requestPositiveInteger('请输入目标颜色数量（建议 1~100）', '16');
        if (num === null) { showToast('请输入有效的数字（>=1）', 2000); return; }
        try { await simplifyColors(num); } catch (error) { console.error('简化颜色出错:', error); showToast('简化颜色时发生错误，请查看控制台。', 3000); }
    });
}

function initPaletteControls() {
    const fullBtn = document.getElementById('paletteFullBtn');
    const lightBtn = document.getElementById('paletteLightBtn');
    if (!fullBtn || !lightBtn) return;
    fullBtn.addEventListener('click', () => {
        if (checkReplaceModeAndWarn()) return;
        switchPalette('full');
        setActiveClass([fullBtn], [lightBtn], 'active');
        showToast('已切换到Mard色卡（221色）', 2000);
    });
    lightBtn.addEventListener('click', () => {
        if (checkReplaceModeAndWarn()) return;
        switchPalette('light');
        setActiveClass([lightBtn], [fullBtn], 'active');
        showToast('已切换到精简版色卡（118色）', 2000);
    });
}

export function applyGridSize(size, elements = {}) {
    const { size52Btn, size104Btn, sizeDisplaySpan } = elements;
    state.currentGridSize = String(size);
    resizeCanvas(size, size);
    if (size === 52) {
        setActiveClass([size52Btn], [size104Btn], 'active-size');
        if (sizeDisplaySpan) sizeDisplaySpan.textContent = '52x52 · 全格显色号';
    } else {
        setActiveClass([size104Btn], [size52Btn], 'active-size');
        if (sizeDisplaySpan) sizeDisplaySpan.textContent = '104x104 · 全格显色号';
    }
    updateStatsWithSort(state.currentSort);
}

function initCanvasSizeControls() {
    const size52Btn = document.getElementById('size52Btn');
    const size104Btn = document.getElementById('size104Btn');
    const sizeDisplaySpan = document.getElementById('sizeDisplay');
    if (!size52Btn || !size104Btn) return;
    size52Btn.addEventListener('click', () => {
        if (state.currentGridSize === '52') return;
        if (checkReplaceModeAndWarn()) return;
        if (!confirm('切换画板大小将清空当前图纸，确定吗？')) return;
        applyGridSize(52, { size52Btn, size104Btn, sizeDisplaySpan });
    });
    size104Btn.addEventListener('click', () => {
        if (state.currentGridSize === '104') return;
        if (checkReplaceModeAndWarn()) return;
        if (!confirm('切换画板大小将清空当前图纸，确定吗？')) return;
        applyGridSize(104, { size52Btn, size104Btn, sizeDisplaySpan });
    });
    if (state.currentGridSize === '52') {
        setActiveClass([size52Btn], [size104Btn], 'active-size');
    } else {
        setActiveClass([size104Btn], [size52Btn], 'active-size');
    }
}

function initClearBackgroundControls() {
    const clearBgBtn = document.getElementById('clearBackgroundBtn');
    if (!clearBgBtn) return;
    clearBgBtn.addEventListener('click', () => {
        if (state.replaceModeActive) {
            showToast('请先退出替换模式（再次点击替换按钮）', 1500);
            return;
        }
        if (state.clearModeActive) {
            state.clearModeActive = false;
            clearBgBtn.classList.remove('active');
            showToast('已取消清除背景模式', 1000);
            return;
        }
        state.clearModeActive = true;
        clearBgBtn.classList.add('active');
        if (!hasShownClearBgTip) {
            showToast('请点击画布上要清除的背景区域（与该颜色连通的区域将变为空白）', 4000);
            hasShownClearBgTip = true;
        }
    });
}

function initMergeRareControls() {
    const mergeRareBtn = document.getElementById('mergeRareBtn');
    if (!mergeRareBtn) return;
    mergeRareBtn.addEventListener('click', () => {
        if (checkReplaceModeAndWarn()) return;
        const threshold = requestPositiveInteger('请输入最小使用数量阈值（低于此值的颜色将被合并）', '5');
        if (threshold === null) { showToast('请输入有效的数字（>=1）', 2000); return; }
        mergeRareColors(threshold);
    });
}

function initReplaceColorControls() {
    const replaceBtn = document.getElementById('replaceColorBtn');
    if (!replaceBtn) return;
    replaceBtn.addEventListener('click', () => {
        if (state.clearModeActive) {
            showToast('请先退出清除背景模式', 1500);
            return;
        }
        if (state.replaceModeActive) {
            cancelReplaceMode();
            replaceBtn.classList.remove('active');
            showToast('已取消替换模式', 1000);
        } else {
            state.replaceModeActive = true;
            state.replaceStep = 1;
            state.replaceSrcColor = null;
            replaceBtn.classList.add('active');
            showToast('替换模式：请点击画布选择要替换的颜色', 2000);
        }
    });
}

// 浮动按钮组折叠功能
function initFloatingButtonsCollapse() {
    const toggleBtn = document.getElementById('toggleFloatingBtnsBtn');
    const floatingBtns = document.querySelector('.floating-buttons');
    if (!toggleBtn || !floatingBtns) return;
    const isCollapsed = localStorage.getItem('floatingBtnsCollapsed') === 'true';
    if (isCollapsed) {
        floatingBtns.classList.add('collapsed');
        toggleBtn.textContent = '🔽';
    } else {
        toggleBtn.textContent = '🔼';
    }
    toggleBtn.addEventListener('click', () => {
        floatingBtns.classList.toggle('collapsed');
        const nowCollapsed = floatingBtns.classList.contains('collapsed');
        localStorage.setItem('floatingBtnsCollapsed', nowCollapsed);
        toggleBtn.textContent = nowCollapsed ? '🔽' : '🔼';
    });
}

export function initUI() {
    initModeControls();
    initCanvasControls();
    initExportImportControls();
    initSortControls();
    initSimplifyControls();
    initPaletteControls();
    initCanvasSizeControls();
    initClearBackgroundControls();
    initMergeRareControls();
    initReplaceColorControls();
    initFloatingButtonsCollapse();
    updateStatsWithSort(state.currentSort);
}