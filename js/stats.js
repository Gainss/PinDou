// js/stats.js
import { state } from './state.js';

const EMPTY_COLOR_NAME = '空白';

/**
 * 获取当前画布中所有非空白颜色的统计信息
 * @returns {Array<{hex: string, name: string, count: number}>}
 */
export function getColorStats() {
    const { gridHeight = 0, gridWidth = 0, gridData = [], hexToNameMap = new Map() } = state;
    const countMap = new Map();

    for (let row = 0; row < gridHeight; row++) {
        const currentRow = gridData[row] || [];
        for (let col = 0; col < gridWidth; col++) {
            const rawHex = currentRow[col];
            const hex = rawHex ? rawHex.toUpperCase() : '';
            if (!hex) continue;
            countMap.set(hex, (countMap.get(hex) || 0) + 1);
        }
    }

    return Array.from(countMap.entries())
        .map(([hex, count]) => ({
            hex,
            name: hexToNameMap.get(hex) || '未知',
            count
        }))
        .filter(item => item.name !== EMPTY_COLOR_NAME);
}

/**
 * 按名称升序排序（A→Z，数字优先）
 */
export function sortByNameAsc(a, b) {
    const nameA = a.name || '';
    const nameB = b.name || '';
    return nameA.localeCompare(nameB, undefined, {
        numeric: true,
        sensitivity: 'base'
    });
}

/**
 * 根据排序方式对统计结果进行排序
 * @param {Array} stats - 统计数组
 * @param {string} sortBy - 排序方式 ('count-desc' 或 'name-asc')
 * @returns {Array} 排序后的数组
 */
export function sortColorStats(stats, sortBy) {
    const safeStats = Array.isArray(stats) ? [...stats] : [];
    switch (sortBy) {
        case 'count-desc':
            return safeStats.sort((a, b) => b.count - a.count);
        case 'name-asc':
            return safeStats.sort(sortByNameAsc);
        default:
            return safeStats;
    }
}

/**
 * 将统计数组渲染为 HTML 字符串
 */
export function renderStatsHtml(stats) {
    if (!Array.isArray(stats) || stats.length === 0) {
        return '<div class="stats-empty">绘制图案后统计将自动更新</div>';
    }
    return stats.map(({ hex, name, count }) => {
        const displayName = escapeHtml(name || EMPTY_COLOR_NAME);
        const safeHex = escapeHtml(hex || '');
        return `
            <div class="stat-item">
                <div class="stat-color" style="background-color: ${safeHex};"></div>
                <div class="stat-label">${displayName}</div>
                <div class="stat-count">${count}</div>
            </div>
        `;
    }).join('');
}

/**
 * 更新统计面板的显示，并根据当前排序方式重新排序
 * @param {string} sortBy - 排序方式 ('count-desc' 或 'name-asc')
 */
export function updateStatsWithSort(sortBy) {
    const statsContainer = document.getElementById('statsContainer');
    if (!statsContainer) return;

    const colorStats = getColorStats();
    const sortedColors = sortColorStats(colorStats, sortBy);

    // 更新统计标题中的颜色数量
    const statsHeader = document.querySelector('.stats-header div:first-child span');
    if (statsHeader) {
        statsHeader.textContent = `📊 颜色使用统计 (已用 ${colorStats.length} 种颜色)`;
    }

    statsContainer.innerHTML = renderStatsHtml(sortedColors);

    // 高亮当前使用的排序按钮
    const sortCountBtn = document.getElementById('sortByCountDesc');
    const sortNameBtn = document.getElementById('sortByNameAsc');
    if (sortCountBtn) {
        sortCountBtn.classList.toggle('active-sort', sortBy === 'count-desc');
    }
    if (sortNameBtn) {
        sortNameBtn.classList.toggle('active-sort', sortBy === 'name-asc');
    }
}

// 简单的 HTML 转义函数，防止 XSS
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}