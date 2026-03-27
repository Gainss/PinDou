export const DEFAULT_GRID_SIZE = 52;
export const BASE_CELL_SIZE = 20;
export const DEFAULT_MODE = 'brush';
export const DEFAULT_COLOR = '#4A6EA8';
export const DEFAULT_SORT = 'count-desc';

export function createInitialState() {
    return {
        gridData: [],
        gridWidth: DEFAULT_GRID_SIZE,
        gridHeight: DEFAULT_GRID_SIZE,
        isDrawing: false,
        currentMode: DEFAULT_MODE,
        currentColor: DEFAULT_COLOR,
        hexToNameMap: new Map(),
        nameToHexMap: new Map(),
        canvas: null,
        ctx: null,
        currentSort: DEFAULT_SORT,
        clearModeActive: false,
        currentGridSize: String(DEFAULT_GRID_SIZE),
        showColorNames: true,
        // 替换颜色模式状态
        replaceModeActive: false,
        replaceStep: 0,        // 0=未激活, 1=等待选择源色, 2=等待选择目标色
        replaceSrcColor: null
    };
}

export const state = createInitialState();

let _onGridDataChange = null;

export function setGridData(newGrid, silent = false) {
    state.gridData = newGrid;
    if (!silent && _onGridDataChange) {
        _onGridDataChange();
    }
}

export function registerGridDataChangeHandler(handler) {
    _onGridDataChange = handler;
}

export function resetState(targetState = state) {
    const initialState = createInitialState();
    Object.keys(targetState).forEach(key => delete targetState[key]);
    Object.assign(targetState, initialState);
    return targetState;
}