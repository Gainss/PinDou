// js/color.js
import { paletteFull as paletteFullSource } from '../palettes/full.js';
import { paletteLight as paletteLightSource } from '../palettes/light.js';

// 校验与只读化函数（同之前）
function isValidPaletteItem(item) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.name !== 'string' || item.name.trim() === '') return false;
    if (!Array.isArray(item.rgb) || item.rgb.length !== 3) return false;
    return item.rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255);
}

function validatePalette(palette, options = { checkDuplicateName: true }) {
    const errors = [];
    if (!Array.isArray(palette)) return { valid: false, errors: ['Palette must be an array.'] };
    const nameSet = new Set();
    palette.forEach((item, idx) => {
        if (!isValidPaletteItem(item)) {
            errors.push(`Invalid palette item at index ${idx}: ${JSON.stringify(item)}`);
            return;
        }
        if (options.checkDuplicateName && nameSet.has(item.name)) {
            errors.push(`Duplicate palette name found: "${item.name}" at index ${idx}`);
        } else {
            nameSet.add(item.name);
        }
    });
    return { valid: errors.length === 0, errors };
}

function createReadonlyPalette(palette) {
    return Object.freeze(palette.map(item => Object.freeze({
        name: item.name,
        rgb: Object.freeze([...item.rgb])
    })));
}

// 校验数据
const fullValidation = validatePalette(paletteFullSource);
const lightValidation = validatePalette(paletteLightSource);
if (!fullValidation.valid) {
    throw new Error(`paletteFull validation failed:\n${fullValidation.errors.join('\n')}`);
}
if (!lightValidation.valid) {
    throw new Error(`paletteLight validation failed:\n${lightValidation.errors.join('\n')}`);
}

// 创建只读版本
const paletteFull = createReadonlyPalette(paletteFullSource);
const paletteLight = createReadonlyPalette(paletteLightSource);
const palette = paletteLight; // 默认使用精简版

// 挂载到全局
window.paletteFull = paletteFull;
window.paletteLight = paletteLight;
window.palette = palette;

// 可选 CommonJS 导出（不影响浏览器）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isValidPaletteItem,
        validatePalette,
        createReadonlyPalette,
        paletteFull,
        paletteLight,
        palette
    };
}