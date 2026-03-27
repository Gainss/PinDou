// js/simplify.js
import { state, setGridData } from './state.js';
import { rgbFromHex, rgbToHex, findClosestPaletteColor } from './utils.js';
import { drawFullGrid } from './canvas.js';
import { showToast } from './toast.js';
import { updateStatsWithSort } from './stats.js';

const DIRECTIONS = [[-1,0],[1,0],[0,-1],[0,1]];
const BLANK_NAME = '空白';
const DEFAULT_BLANK_HEX = '#FFFFFF';

function getColorName(hex) {
    return state.hexToNameMap.get(hex.toUpperCase());
}
function isBlankColor(hex) {
    return getColorName(hex) === BLANK_NAME;
}
function cloneGrid(grid) {
    return grid.map(row => [...row]);
}
function isValidCell(row, col, height = state.gridHeight, width = state.gridWidth) {
    return row >= 0 && row < height && col >= 0 && col < width;
}
function countNonBlankColorsInGrid(grid) {
    const colorCount = new Map();
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            const hex = grid[row][col];
            if (isBlankColor(hex)) continue;
            colorCount.set(hex, (colorCount.get(hex) || 0) + 1);
        }
    }
    return colorCount;
}
function getUsedColors() {
    const colorCountMap = countNonBlankColorsInGrid(state.gridData);
    return Array.from(colorCountMap.entries()).map(([hex, count]) => ({
        hex,
        rgb: rgbFromHex(hex),
        count
    }));
}

export function mergeSmallRegions(maxArea = 3, maxColorCount = 3, render = true) {
    const H = state.gridHeight, W = state.gridWidth;
    let changed = false;
    const globalColorCount = countNonBlankColorsInGrid(state.gridData);
    const visited = Array.from({ length: H }, () => Array(W).fill(false));
    const regions = [];
    for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
            if (visited[i][j]) continue;
            const color = state.gridData[i][j];
            visited[i][j] = true;
            if (isBlankColor(color)) continue;
            const cells = [];
            const queue = [[i, j]];
            let head = 0;
            while (head < queue.length) {
                const [r, c] = queue[head++];
                cells.push([r, c]);
                for (const [dr, dc] of DIRECTIONS) {
                    const nr = r + dr, nc = c + dc;
                    if (isValidCell(nr, nc, H, W) && !visited[nr][nc] && state.gridData[nr][nc] === color) {
                        visited[nr][nc] = true;
                        queue.push([nr, nc]);
                    }
                }
            }
            regions.push({ color, cells, area: cells.length });
        }
    }
    const smallRegions = regions.filter(r => r.area <= maxArea && (globalColorCount.get(r.color) || 0) <= maxColorCount);
    if (smallRegions.length === 0) return false;
    const newGrid = cloneGrid(state.gridData);
    for (const region of smallRegions) {
        const neighborCount = new Map();
        for (const [r, c] of region.cells) {
            for (const [dr, dc] of DIRECTIONS) {
                const nr = r + dr, nc = c + dc;
                if (!isValidCell(nr, nc, H, W)) continue;
                const neighborColor = state.gridData[nr][nc];
                if (neighborColor === region.color || isBlankColor(neighborColor)) continue;
                neighborCount.set(neighborColor, (neighborCount.get(neighborColor) || 0) + 1);
            }
        }
        if (neighborCount.size === 0) continue;
        let bestColor = null, bestCount = -1;
        for (const [color, cnt] of neighborCount) {
            if (cnt > bestCount) {
                bestCount = cnt;
                bestColor = color;
            }
        }
        if (!bestColor) continue;
        for (const [r, c] of region.cells) {
            if (newGrid[r][c] !== bestColor) {
                newGrid[r][c] = bestColor;
                changed = true;
            }
        }
    }
    if (changed && render) setGridData(newGrid);
    return changed;
}

export function smoothEdges(render = true) {
    const H = state.gridHeight, W = state.gridWidth;
    const newGrid = cloneGrid(state.gridData);
    let changed = false;
    for (let i = 0; i < H; i++) {
        for (let j = 0; j < W; j++) {
            const colorCount = new Map();
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const ni = i + di, nj = j + dj;
                    if (!isValidCell(ni, nj, H, W)) continue;
                    const color = state.gridData[ni][nj];
                    if (isBlankColor(color)) continue;
                    colorCount.set(color, (colorCount.get(color) || 0) + 1);
                }
            }
            if (colorCount.size === 0) continue;
            let dominantColor = null, maxCount = 0;
            for (const [color, cnt] of colorCount) {
                if (cnt > maxCount) {
                    maxCount = cnt;
                    dominantColor = color;
                }
            }
            if (dominantColor && maxCount >= 5 && dominantColor !== state.gridData[i][j]) {
                newGrid[i][j] = dominantColor;
                changed = true;
            }
        }
    }
    if (changed && render) setGridData(newGrid);
    return changed;
}

export async function simplifyColors(targetColorCount) {
    try {
        console.log('开始简化颜色，目标数量:', targetColorCount);
        const usedColors = getUsedColors();
        console.log('当前使用颜色数量:', usedColors.length);
        if (!Number.isInteger(targetColorCount) || targetColorCount <= 0) {
            showToast('目标颜色数量必须是大于 0 的整数。', 3000);
            return false;
        }
        if (usedColors.length <= targetColorCount) {
            showToast(`当前图案仅使用 ${usedColors.length} 种颜色，无需简化。`, 3000);
            return false;
        }
        const points = usedColors.map(color => ({ r: color.rgb.r, g: color.rgb.g, b: color.rgb.b, weight: color.count }));
        const centroids = kMeans(points, targetColorCount);
        const centroidColors = centroids.map(c => findClosestPaletteColor(rgbToHex(c.r, c.g, c.b)));
        const colorMapping = new Map();
        usedColors.forEach(color => {
            let minDist = Infinity, bestCentroidHex = centroidColors[0];
            for (let i = 0; i < centroids.length; i++) {
                const c = centroids[i];
                const dr = color.rgb.r - c.r, dg = color.rgb.g - c.g, db = color.rgb.b - c.b;
                const dist = dr*dr + dg*dg + db*db;
                if (dist < minDist) {
                    minDist = dist;
                    bestCentroidHex = centroidColors[i];
                }
            }
            colorMapping.set(color.hex, bestCentroidHex);
        });
        const newGrid = cloneGrid(state.gridData);
        let changedCount = 0;
        for (let row = 0; row < state.gridHeight; row++) {
            for (let col = 0; col < state.gridWidth; col++) {
                const oldHex = newGrid[row][col];
                if (isBlankColor(oldHex)) continue;
                const newHex = colorMapping.get(oldHex);
                if (newHex && newHex !== oldHex) {
                    newGrid[row][col] = newHex;
                    changedCount++;
                }
            }
        }
        setGridData(newGrid, true);
        const merged = mergeSmallRegions(3, 3, false);
        const smoothed = smoothEdges(false);
        const hasAnyChange = changedCount > 0 || merged || smoothed;
        if (hasAnyChange) drawFullGrid();
        updateStatsWithSort(state.currentSort);
        const newColorCount = new Set(state.gridData.flat().filter(hex => !isBlankColor(hex))).size;
        showToast(`颜色简化完成！\n简化前: ${usedColors.length} 种\n简化后: ${newColorCount} 种\n共修改 ${changedCount} 个格子。`, 4000);
        return hasAnyChange;
    } catch (err) {
        console.error('颜色简化出错:', err);
        showToast('颜色简化失败，请查看控制台错误信息：' + err.message, 4000);
        return false;
    }
}

export function clearBackground(startRow, startCol) {
    if (!isValidCell(startRow, startCol)) {
        showToast('所选坐标超出范围。', 2000);
        return false;
    }
    const targetColor = state.gridData[startRow][startCol];
    if (isBlankColor(targetColor)) {
        showToast('点击的区域已经是空白，无需清除', 2000);
        return false;
    }

    const H = state.gridHeight, W = state.gridWidth;
    const queue = [[startRow, startCol]];
    const visited = Array.from({ length: H }, () => Array(W).fill(false));
    visited[startRow][startCol] = true;
    let head = 0, changed = false, clearedCount = 0;
    const newGrid = cloneGrid(state.gridData);
    while (head < queue.length) {
        const [r, c] = queue[head++];
        if (newGrid[r][c] !== targetColor) continue;
        newGrid[r][c] = DEFAULT_BLANK_HEX;
        changed = true;
        clearedCount++;
        for (const [dr, dc] of DIRECTIONS) {
            const nr = r + dr, nc = c + dc;
            if (isValidCell(nr, nc, H, W) && !visited[nr][nc] && state.gridData[nr][nc] === targetColor) {
                visited[nr][nc] = true;
                queue.push([nr, nc]);
            }
        }
    }
    if (changed) {
        setGridData(newGrid);
        showToast(`已清除与所选格子颜色相同的连通区域（共 ${clearedCount} 个格子）`, 3000);
    } else {
        showToast('没有找到可清除的连通区域', 2000);
    }
    return changed;
}

export function mergeRareColors(minCount = 5) {
    const colorCount = countNonBlankColorsInGrid(state.gridData);
    const abundantColors = [], rareColors = [];
    for (const [hex, count] of colorCount) {
        const item = { hex, count, rgb: rgbFromHex(hex) };
        if (count >= minCount) abundantColors.push(item);
        else rareColors.push(item);
    }
    if (rareColors.length === 0) {
        showToast(`所有颜色使用数量均 ≥ ${minCount}，无需合并`, 2000);
        return false;
    }
    if (abundantColors.length === 0) {
        showToast(`没有足够多的颜色（数量 ≥ ${minCount}）作为目标，无法合并。`, 3000);
        return false;
    }
    const replaceMap = new Map();
    for (const rare of rareColors) {
        let bestColor = null, minDist = Infinity;
        for (const abundant of abundantColors) {
            const dr = rare.rgb.r - abundant.rgb.r, dg = rare.rgb.g - abundant.rgb.g, db = rare.rgb.b - abundant.rgb.b;
            const dist = dr*dr + dg*dg + db*db;
            if (dist < minDist) {
                minDist = dist;
                bestColor = abundant.hex;
            }
        }
        replaceMap.set(rare.hex, bestColor);
    }
    const newGrid = cloneGrid(state.gridData);
    let changedCount = 0;
    for (let row = 0; row < state.gridHeight; row++) {
        for (let col = 0; col < state.gridWidth; col++) {
            const oldHex = newGrid[row][col];
            const newHex = replaceMap.get(oldHex);
            if (newHex && newHex !== oldHex) {
                newGrid[row][col] = newHex;
                changedCount++;
            }
        }
    }
    if (changedCount > 0) {
        setGridData(newGrid);
        showToast(`合并完成！\n共将 ${rareColors.length} 种使用数量 < ${minCount} 的颜色合并到相近的大颜色中。\n修改了 ${changedCount} 个格子。`, 4000);
        return true;
    }
    showToast('没有发生任何变化，可能是阈值设置问题。', 2000);
    return false;
}

export function kMeans(points, k, maxIter = 30) {
    if (!Array.isArray(points) || points.length === 0 || k <= 0) return [];
    if (k >= points.length) return points.map(p => ({ r: p.r, g: p.g, b: p.b }));
    let centroids = [];
    const totalWeight = points.reduce((sum, p) => sum + (p.weight || 1), 0);
    for (let i = 0; i < k; i++) {
        let rand = Math.random() * totalWeight, accum = 0;
        for (const point of points) {
            accum += (point.weight || 1);
            if (rand <= accum) {
                centroids.push({ r: point.r, g: point.g, b: point.b });
                break;
            }
        }
        if (!centroids[i]) {
            const fallback = points[points.length - 1];
            centroids.push({ r: fallback.r, g: fallback.g, b: fallback.b });
        }
    }
    let changed = true, iter = 0;
    while (changed && iter < maxIter) {
        const clusters = Array.from({ length: k }, () => []);
        for (const point of points) {
            let minDist = Infinity, bestIdx = 0;
            for (let i = 0; i < centroids.length; i++) {
                const c = centroids[i];
                const dr = point.r - c.r, dg = point.g - c.g, db = point.b - c.b;
                const dist = dr*dr + dg*dg + db*db;
                if (dist < minDist) {
                    minDist = dist;
                    bestIdx = i;
                }
            }
            clusters[bestIdx].push(point);
        }
        const newCentroids = [];
        for (let i = 0; i < k; i++) {
            const cluster = clusters[i];
            if (cluster.length === 0) {
                const randIdx = Math.floor(Math.random() * points.length);
                const point = points[randIdx];
                newCentroids.push({ r: point.r, g: point.g, b: point.b });
                continue;
            }
            let sumR = 0, sumG = 0, sumB = 0, totalW = 0;
            for (const point of cluster) {
                const w = point.weight || 1;
                sumR += point.r * w;
                sumG += point.g * w;
                sumB += point.b * w;
                totalW += w;
            }
            newCentroids.push({ r: Math.round(sumR / totalW), g: Math.round(sumG / totalW), b: Math.round(sumB / totalW) });
        }
        changed = false;
        for (let i = 0; i < k; i++) {
            if (centroids[i].r !== newCentroids[i].r || centroids[i].g !== newCentroids[i].g || centroids[i].b !== newCentroids[i].b) {
                changed = true;
                break;
            }
        }
        centroids = newCentroids;
        iter++;
    }
    return centroids;
}