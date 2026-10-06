// NeDB 1.8.0 and nedb-logger rely on util.isDate / util.isRegExp / util.isArray
// (and other legacy util.is* helpers). Node 22 (bundled with Electron 42)
// removed these, which breaks every NeDB insert/update/find. Restore the
// legacy helpers before NeDB is required. Requiring this module is a no-op on
// older Node versions where the functions still exist.
const util = require('util');

const legacy = {
    isArray: Array.isArray,
    isBoolean: (v) => typeof v === 'boolean',
    isBuffer: Buffer.isBuffer,
    isDate: (v) => v instanceof Date,
    isError: (v) => v instanceof Error || (typeof v === 'object' && v !== null && Object.prototype.toString.call(v) === '[object Error]'),
    isFunction: (v) => typeof v === 'function',
    isNull: (v) => v === null,
    isNullOrUndefined: (v) => v === null || v === undefined,
    isNumber: (v) => typeof v === 'number',
    isObject: (v) => typeof v === 'object' && v !== null,
    isPrimitive: (v) => v === null || (typeof v !== 'object' && typeof v !== 'function'),
    isRegExp: (v) => v instanceof RegExp,
    isString: (v) => typeof v === 'string',
    isSymbol: (v) => typeof v === 'symbol',
    isUndefined: (v) => v === undefined,
};

for (const [name, fn] of Object.entries(legacy)) {
    if (typeof util[name] !== 'function') {
        util[name] = fn;
    }
}
