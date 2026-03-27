import { state } from './state.js';
import { initPalette, renderPaletteGrid } from './palette.js';
import { initCanvas } from './canvas.js';
import { initUI } from './ui.js';
import { registerGridDataChangeHandler } from './state.js';
import { drawFullGrid } from './canvas.js';
import { updateStatsWithSort } from './stats.js';

const PALETTE_GRID_ID = 'paletteGrid';

// 注册全局状态变更回调，自动重绘画布并更新统计
registerGridDataChangeHandler(() => {
    drawFullGrid();
    updateStatsWithSort(state.currentSort);
});

export function startApp({
    win = window,
    showAlert = alert,
    paletteInitializer = initPalette,
    canvasInitializer = initCanvas,
    paletteRenderer = renderPaletteGrid,
    uiInitializer = initUI,
    gridId = PALETTE_GRID_ID
} = {}) {
    try {
        if (typeof win.palette === 'undefined') {
            showAlert('错误：未找到色卡数据文件 color.js');
            return false;
        }
        paletteInitializer();
        canvasInitializer();
        paletteRenderer(gridId);
        uiInitializer();
        return true;
    } catch (error) {
        console.error('应用启动失败：', error);
        showAlert('应用启动失败，请检查控制台日志。');
        return false;
    }
}

function bootstrap() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => startApp(), { once: true });
    } else {
        startApp();
    }
}
bootstrap();