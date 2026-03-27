import { state, setGridData, BASE_CELL_SIZE } from './state.js';
import { getColorStats, sortByNameAsc } from './stats.js';
import { drawFullGrid } from './canvas.js';
import { rgbToHex, rgbFromHex, findClosestPaletteColor } from './utils.js';
import { showToast } from './toast.js';
import { kMeans } from './simplify.js';

const EXPORT_SCALE = 2;
const TEXT_LUMINANCE_THRESHOLD = 186;
const ALPHA_THRESHOLD = 128;
const DEFAULT_TARGET_COLORS = 15;
const SMALL_IMAGE_TARGET_COLORS = 15;
const MEDIUM_IMAGE_TARGET_COLORS = 15;
const WHITE_HEX = rgbToHex(255, 255, 255);
const COLOR_MERGE_THRESHOLD = 50;

// ==================== 辅助函数 ====================
function getContrastTextColor(hex) {
    const { r, g, b } = rgbFromHex(hex);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > TEXT_LUMINANCE_THRESHOLD ? '#000000' : '#FFFFFF';
}

function generateTimestamp(date = new Date()) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
}

function triggerDownload(filename, href) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = href;
    link.click();
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    try { triggerDownload(filename, url); } finally { URL.revokeObjectURL(url); }
}

function get2DContext(canvas) {
    return canvas?.getContext ? canvas.getContext('2d') : null;
}

// ==================== 历史数据 ====================
export function buildHistoryData() {
    const nameGrid = state.gridData.map(row =>
        row.map(hex => state.hexToNameMap.get(String(hex).toUpperCase()) || '空白')
    );
    return { version: 1, width: state.gridWidth, height: state.gridHeight, colors: nameGrid };
}

export function validateHistoryData(data, expectedWidth, expectedHeight) {
    if (!data || typeof data !== 'object') return { valid: false, message: '无效的历史文件：文件内容不是对象' };
    if (!data.version || !data.width || !data.height || !data.colors) return { valid: false, message: '无效的历史文件：缺少必要字段' };
    if (data.width !== expectedWidth || data.height !== expectedHeight) return { valid: false, message: `尺寸不匹配：文件为 ${data.width}x${data.height}，当前画布为 ${expectedWidth}x${expectedHeight}` };
    if (!Array.isArray(data.colors) || data.colors.length !== expectedHeight || !data.colors.every(row => Array.isArray(row) && row.length === expectedWidth)) return { valid: false, message: '颜色数据格式错误' };
    return { valid: true };
}

export function mapHistoryColorsToGrid(colors, nameToHexMap, fallbackMap = null) {
    const newGrid = [];
    let fallbackUsed = false;
    for (let row = 0; row < colors.length; row++) {
        const newRow = [];
        for (let col = 0; col < colors[row].length; col++) {
            const name = colors[row][col];
            let hex = nameToHexMap.get(name);
            if (!hex && fallbackMap) {
                hex = fallbackMap(name);
                if (hex) fallbackUsed = true;
            }
            if (!hex) return { ok: false, message: `未知色号：${name}（第 ${row + 1} 行，第 ${col + 1} 列），请检查文件` };
            newRow.push(hex);
        }
        newGrid.push(newRow);
    }
    if (fallbackUsed) {
        showToast('提示：部分颜色在当前色卡中不存在，已自动映射到最接近的颜色。', 3000);
    }
    return { ok: true, grid: newGrid };
}

function getTargetColorCount(pixelCount) {
    return 15; // 固定为 15
}

// ==================== 导出功能 ====================
export function exportCanvasPNG() {
    if (!state.canvas) return;
    const scaledCellSize = BASE_CELL_SIZE * EXPORT_SCALE;
    const width = state.gridWidth * scaledCellSize;
    const height = state.gridHeight * scaledCellSize;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = width; offCanvas.height = height;
    const offCtx = get2DContext(offCanvas);
    if (!offCtx) { showToast('导出失败：无法获取画布上下文', 2000); return; }
    offCtx.imageSmoothingEnabled = false;

    // 绘制像素格子
    for (let row = 0; row < state.gridHeight; row++) {
        for (let col = 0; col < state.gridWidth; col++) {
            offCtx.fillStyle = state.gridData[row][col];
            offCtx.fillRect(col * scaledCellSize, row * scaledCellSize, scaledCellSize, scaledCellSize);
        }
    }

    // 绘制网格线
    offCtx.beginPath();
    offCtx.strokeStyle = '#c0b6a8';
    offCtx.lineWidth = 0.8 * EXPORT_SCALE;
    for (let i = 0; i <= state.gridWidth; i++) {
        offCtx.moveTo(i * scaledCellSize, 0);
        offCtx.lineTo(i * scaledCellSize, height);
    }
    for (let i = 0; i <= state.gridHeight; i++) {
        offCtx.moveTo(0, i * scaledCellSize);
        offCtx.lineTo(width, i * scaledCellSize);
    }
    offCtx.stroke();
    offCtx.beginPath();
    offCtx.strokeStyle = '#9a8b7c';
    offCtx.lineWidth = 1.5 * EXPORT_SCALE;
    offCtx.strokeRect(0, 0, width, height);

    // 只有显示色号时才绘制文字
    if (state.showColorNames) {
        offCtx.font = `bold ${10 * EXPORT_SCALE}px "Courier New", monospace`;
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        for (let row = 0; row < state.gridHeight; row++) {
            for (let col = 0; col < state.gridWidth; col++) {
                const hex = state.gridData[row][col];
                const name = state.hexToNameMap.get(String(hex).toUpperCase());
                if (!name || name === '空白') continue;
                offCtx.fillStyle = getContrastTextColor(hex);
                const x = col * scaledCellSize + scaledCellSize / 2;
                const y = row * scaledCellSize + scaledCellSize / 2;
                offCtx.fillText(name, x, y);
            }
        }
    }

    triggerDownload('图豆师图纸.png', offCanvas.toDataURL('image/png'));
}

export function exportUsedPalettePNG() {
    const colors = getColorStats();
    if (colors.length === 0) { showToast('没有使用任何颜色', 2000); return; }
    const sortedColors = [...colors].sort(sortByNameAsc);
    const groups = new Map();
    sortedColors.forEach(colorItem => {
        const firstChar = colorItem.name ? colorItem.name.charAt(0) : '?';
        const key = /[A-Za-z]/.test(firstChar) ? firstChar.toUpperCase() : firstChar;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(colorItem);
    });
    const circleRadius = 24, circleDiameter = circleRadius * 2, margin = 90 * 1.5, rowExtra = 70 * 1.5, topMargin = 70, leftMargin = 50, maxPerRow = 6;
    let currentY = topMargin;
    const groupRows = [];
    groups.forEach(groupItems => {
        const rows = [];
        for (let i = 0; i < groupItems.length; i += maxPerRow) rows.push(groupItems.slice(i, i + maxPerRow));
        groupRows.push({ rows, startY: currentY });
        currentY += rows.length * (circleDiameter + rowExtra);
    });
    const canvasWidth = maxPerRow * (circleDiameter + margin) - margin + leftMargin * 2;
    const canvasHeight = currentY;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvasWidth; offCanvas.height = canvasHeight;
    const offCtx = get2DContext(offCanvas);
    if (!offCtx) { showToast('导出失败：无法获取画布上下文', 2000); return; }
    offCtx.fillStyle = '#FFFFFF'; offCtx.fillRect(0, 0, canvasWidth, canvasHeight);
    offCtx.font = 'bold 35px sans-serif'; offCtx.fillStyle = '#000000'; offCtx.textAlign = 'center';
    offCtx.fillText('图豆师色卡', canvasWidth / 2, 50);
    offCtx.textAlign = 'center'; offCtx.textBaseline = 'middle';
    groupRows.forEach(group => {
        const { rows, startY } = group;
        for (let r = 0; r < rows.length; r++) {
            const rowItems = rows[r];
            const rowY = startY + r * (circleDiameter + rowExtra);
            const rowWidth = rowItems.length * (circleDiameter + margin) - margin;
            const startX = (canvasWidth - rowWidth) / 2 + circleRadius;
            for (let c = 0; c < rowItems.length; c++) {
                const item = rowItems[c];
                const cx = startX + c * (circleDiameter + margin);
                const cy = rowY + circleRadius;
                offCtx.beginPath(); offCtx.arc(cx, cy, circleRadius, 0, 2 * Math.PI);
                offCtx.fillStyle = item.hex; offCtx.fill();
                offCtx.strokeStyle = '#000000'; offCtx.lineWidth = 1; offCtx.stroke();
                offCtx.font = 'bold 28px "Courier New", monospace'; offCtx.fillStyle = '#000000';
                const displayName = item.name || '空白';
                const textY = cy + circleRadius + 30;
                offCtx.fillText(`${displayName} x${item.count}`, cx, textY);
            }
        }
    });
    triggerDownload('已用图豆师色卡.png', offCanvas.toDataURL('image/png'));
}

export function exportHistory() {
    const historyData = buildHistoryData();
    const jsonStr = JSON.stringify(historyData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    downloadBlob(`图豆师历史_${generateTimestamp()}.json`, blob);
}

export function importHistory(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            const validation = validateHistoryData(data, state.gridWidth, state.gridHeight);
            if (!validation.valid) { showToast(validation.message, 3000); return; }
            const betterFallback = (name) => {
                const allColors = window.palette;
                if (!allColors) return null;
                const lowerName = name.toLowerCase();
                const match = allColors.find(item => item.name.toLowerCase() === lowerName);
                if (match) return rgbToHex(match.rgb[0], match.rgb[1], match.rgb[2]);
                const partial = allColors.find(item => item.name.toLowerCase().includes(lowerName) || lowerName.includes(item.name.toLowerCase()));
                if (partial) return rgbToHex(partial.rgb[0], partial.rgb[1], partial.rgb[2]);
                return null;
            };
            const mapped = mapHistoryColorsToGrid(data.colors, state.nameToHexMap, betterFallback);
            if (!mapped.ok) { showToast(mapped.message, 3000); return; }
            setGridData(mapped.grid);
        } catch (err) { showToast('解析文件失败：' + err.message, 3000); }
    };
    reader.readAsText(file);
}

// ==================== 图片上传（使用 Worker） ====================
export function uploadImage(file) {
    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.onload = () => {
            const offCanvas = document.createElement('canvas');
            offCanvas.width = state.gridWidth;
            offCanvas.height = state.gridHeight;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(img, 0, 0, state.gridWidth, state.gridHeight);
            const imageData = offCtx.getImageData(0, 0, state.gridWidth, state.gridHeight);

            const targetColors = getTargetColorCount(state.gridWidth * state.gridHeight);

            showToast('正在处理图片，请稍候...', 0);

            const worker = new Worker('worker/image-processor.js');
            worker.postMessage({
                imageData,
                width: state.gridWidth,
                height: state.gridHeight,
                palette: window.palette,
                targetColors
            });
            worker.onmessage = (e) => {
                if (e.data.error) {
                    console.error('Worker error:', e.data.error, e.data.stack);
                    showToast('处理失败：' + e.data.error, 3000);
                    worker.terminate();
                    return;
                }
                setGridData(e.data.gridData);
                worker.terminate();
                showToast('图片转换完成', 2000);
            };
            worker.onerror = (err) => {
                console.error('Worker onerror:', err);
                showToast('Worker 错误，请重试', 3000);
                worker.terminate();
            };
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}