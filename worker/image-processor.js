// worker/image-processor.js
self.onmessage = function(e) {
    try {
        const { imageData, width, height, palette, targetColors } = e.data;

        if (!imageData || !width || !height || !palette) {
            throw new Error('缺少必要参数');
        }
        if (!Array.isArray(palette) || palette.length === 0) {
            throw new Error('色卡数据无效');
        }

        const resultGrid = processImage(imageData, width, height, palette, targetColors || 15);
        self.postMessage({ gridData: resultGrid });
    } catch (err) {
        console.error('Worker error:', err);
        self.postMessage({ error: err.message, stack: err.stack });
    }
};

// ==================== 工具函数 ====================
function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function rgbFromHex(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16)
    };
}

function findClosestPaletteColor(hex, palette) {
    const { r, g, b } = rgbFromHex(hex);
    let minDist = Infinity;
    let closestHex = null;
    for (const item of palette) {
        if (!item.rgb || item.rgb.length !== 3) continue;
        const [pr, pg, pb] = item.rgb;
        const dr = pr - r;
        const dg = pg - g;
        const db = pb - b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
            minDist = dist;
            closestHex = rgbToHex(pr, pg, pb);
        }
    }
    return closestHex;
}

// Floyd-Steinberg 抖动
function floydSteinbergDither(imageData, quantizeFunc) {
    const { width, height, data } = imageData;
    const result = new Uint8ClampedArray(data.length);
    const buffer = new Float64Array(width * height * 3);

    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        buffer[i * 3] = r;
        buffer[i * 3 + 1] = g;
        buffer[i * 3 + 2] = b;
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            const oldR = buffer[idx];
            const oldG = buffer[idx + 1];
            const oldB = buffer[idx + 2];

            const newRGB = quantizeFunc(oldR, oldG, oldB);
            const newR = newRGB[0];
            const newG = newRGB[1];
            const newB = newRGB[2];

            const errR = oldR - newR;
            const errG = oldG - newG;
            const errB = oldB - newB;

            const pixelIdx = (y * width + x) * 4;
            result[pixelIdx] = newR;
            result[pixelIdx + 1] = newG;
            result[pixelIdx + 2] = newB;
            result[pixelIdx + 3] = data[pixelIdx + 3];

            if (x + 1 < width) {
                buffer[idx + 3] += errR * 7 / 16;
                buffer[idx + 4] += errG * 7 / 16;
                buffer[idx + 5] += errB * 7 / 16;
            }
            if (y + 1 < height) {
                if (x - 1 >= 0) {
                    const downLeftIdx = ((y + 1) * width + (x - 1)) * 3;
                    buffer[downLeftIdx] += errR * 3 / 16;
                    buffer[downLeftIdx + 1] += errG * 3 / 16;
                    buffer[downLeftIdx + 2] += errB * 3 / 16;
                }
                const downIdx = ((y + 1) * width + x) * 3;
                buffer[downIdx] += errR * 5 / 16;
                buffer[downIdx + 1] += errG * 5 / 16;
                buffer[downIdx + 2] += errB * 5 / 16;
                if (x + 1 < width) {
                    const downRightIdx = ((y + 1) * width + (x + 1)) * 3;
                    buffer[downRightIdx] += errR * 1 / 16;
                    buffer[downRightIdx + 1] += errG * 1 / 16;
                    buffer[downRightIdx + 2] += errB * 1 / 16;
                }
            }
        }
    }
    return result;
}

// 核心处理：量化 + 色卡映射
function processImage(imageData, width, height, palette, targetColors) {
    // 1. 将原图颜色量化到 targetColors 种
    const quantizedColors = quantizeImageColors(imageData, targetColors);
    // 2. 定义量化函数：先找最近量化颜色，再映射到色卡
    const quantizeFunc = (r, g, b) => {
        let minDist = Infinity;
        let bestRGB = [r, g, b];
        for (const col of quantizedColors) {
            const dr = r - col[0];
            const dg = g - col[1];
            const db = b - col[2];
            const dist = dr * dr + dg * dg + db * db;
            if (dist < minDist) {
                minDist = dist;
                bestRGB = col;
            }
        }
        const hex = rgbToHex(bestRGB[0], bestRGB[1], bestRGB[2]);
        const paletteHex = findClosestPaletteColor(hex, palette);
        if (!paletteHex) return [255, 255, 255];
        const { r: pr, g: pg, b: pb } = rgbFromHex(paletteHex);
        return [pr, pg, pb];
    };
    // 3. 抖动
    const ditheredData = floydSteinbergDither(imageData, quantizeFunc);
    // 4. 转网格
    return imageDataToGrid(ditheredData, width, height);
}

function imageDataToGrid(data, width, height) {
    const grid = [];
    for (let row = 0; row < height; row++) {
        const rowArr = [];
        for (let col = 0; col < width; col++) {
            const idx = (row * width + col) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            if (a < 128) {
                rowArr.push('#FFFFFF');
            } else {
                rowArr.push(rgbToHex(r, g, b));
            }
        }
        grid.push(rowArr);
    }
    return grid;
}

// ==================== 量化相关函数 ====================
function kMeans(points, k, maxIter = 30) {
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
                const dist = dr * dr + dg * dg + db * db;
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

function mergeSimilarColors(colors, threshold) {
    if (colors.length <= 1) return colors;
    const merged = [];
    const used = new Array(colors.length).fill(false);
    for (let i = 0; i < colors.length; i++) {
        if (used[i]) continue;
        let [r, g, b] = colors[i];
        let count = 1;
        used[i] = true;
        for (let j = i + 1; j < colors.length; j++) {
            if (used[j]) continue;
            const dr = r - colors[j][0];
            const dg = g - colors[j][1];
            const db = b - colors[j][2];
            const dist2 = dr * dr + dg * dg + db * db;
            if (dist2 <= threshold) {
                r += colors[j][0];
                g += colors[j][1];
                b += colors[j][2];
                count++;
                used[j] = true;
            }
        }
        merged.push([Math.round(r / count), Math.round(g / count), Math.round(b / count)]);
    }
    return merged;
}

function quantizeImageColors(imageData, targetColorCount) {
    const { width, height, data } = imageData;
    const points = [];
    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const a = data[i * 4 + 3];
        if (a >= 128) {
            points.push({ r, g, b, weight: 1 });
        }
    }
    if (points.length === 0) return [[255, 255, 255]];
    let centroids = kMeans(points, Math.min(targetColorCount, points.length), 20);
    let quantized = centroids.map(c => [c.r, c.g, c.b]);
    quantized = mergeSimilarColors(quantized, 50);
    return quantized;
}