import { state } from './state.js';

export function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

export function rgbFromHex(hex) {
    return {
        r: parseInt(hex.slice(1,3), 16),
        g: parseInt(hex.slice(3,5), 16),
        b: parseInt(hex.slice(5,7), 16)
    };
}

export function findClosestPaletteColor(hex) {
    const { r, g, b } = rgbFromHex(hex);
    let minDist = Infinity;
    let closestHex = null;
    for (let item of window.palette) {
        const [pr, pg, pb] = item.rgb;
        const dr = pr - r;
        const dg = pg - g;
        const db = pb - b;
        const dist = dr*dr + dg*dg + db*db;
        if (dist < minDist) {
            minDist = dist;
            closestHex = rgbToHex(pr, pg, pb);
        }
    }
    return closestHex;
}

export function initGridData(width, height) {
    const whiteHex = rgbToHex(255,255,255);
    const newGrid = [];
    for (let row = 0; row < height; row++) {
        const rowArray = [];
        for (let col = 0; col < width; col++) {
            rowArray.push(whiteHex);
        }
        newGrid.push(rowArray);
    }
    return newGrid;
}