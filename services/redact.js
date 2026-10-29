// Removes credentials from data before it is logged, stored or shown.
//
// Every axios request carries the login (`auth`, or an Authorization header),
// and uploads and downloads add the JSESSIONID cookie and an XNAT_CSRF token in
// the URL. axios copies all of that onto its errors and responses, so logging a
// failed request used to write the user's password (or alias token), session
// cookie and CSRF token in plain text. Help > Save Log File puts those logs in
// the zip that users send to support.

const REDACTED = '[REDACTED]'

// Object keys whose values are always replaced, compared in lower case.
const SECRET_KEYS = new Set([
    'auth',
    'password',
    'secret',
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'xnat_csrf',
    'csrftoken',
    'jsessionid',
])

const MAX_DEPTH = 10

// The same keys in text that was already serialized: a response passed through
// JSON.stringify, an error message built from one, or an object as earlier
// versions of electron-log wrote it (util.inspect style). Only string values
// match; "auth" is one when Node's request options hold the login as
// "user:password". (Set-Cookie arrays are covered by the JSESSIONID pattern.)
// Values are read escape by escape, so a quote in a password doesn't end the
// match early.
//   JSON_VALUE         "password":"x"
//   NESTED_JSON_VALUE  \"password\":\"x\"  (JSON inside a JSON string, which
//                      is how the transfer log stores string details)
//   INSPECT_VALUE      password: 'x'  or  'proxy-authorization': "x"
const JSON_VALUE = /("(?:auth|password|secret|authorization|proxy-authorization|cookie|xnat_csrf|csrftoken|jsessionid)"\s*:\s*")(?:[^"\\]|\\.)*(")/gi
const NESTED_JSON_VALUE = /(\\"(?:auth|password|secret|authorization|proxy-authorization|cookie|xnat_csrf|csrftoken|jsessionid)\\"\s*:\s*\\")(?:[^"\\]|\\\\(?:\\"|\\\\|[^"\\]))*(\\")/gi
const INSPECT_VALUE = /((?<![\w$.-])'?(?:auth|password|secret|authorization|proxy-authorization|cookie|xnat_csrf|csrftoken|jsessionid)'?\s*:\s*)(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/gi

// Secrets that appear outside object keys.
const TEXT_PATTERNS = [
    // XNAT_CSRF=<token> in a URL
    [/(XNAT_CSRF=)[^&#\s"'\\]+/gi, `$1${REDACTED}`],
    // JSESSIONID=<id> in a Cookie or Set-Cookie header
    [/(JSESSIONID=)[^;&\s"'\\]+/gi, `$1${REDACTED}`],
    // Authorization: Basic <credentials> in a raw HTTP request header
    [/(Authorization:\s*)(?:Basic|Bearer)\s+[^\s"'\\]+/gi, `$1${REDACTED}`],
    // user:password@ in a URL, which Node's HTTP client builds from the login.
    // The lookbehind keeps a long run of letters from being retried at every
    // position.
    [/(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@"'\\]+@/gi, `$1${REDACTED}@`],
    // the alias-token secret in an xnat:// or xnats:// link, and in what is left
    // of the link's query elsewhere (a=<alias>&s=<secret>)
    [/(xnats?:\/\/[^\s"'\\]*?[?&](?:s|SECRET)=)[^&#\s"'\\]+/gi, `$1${REDACTED}`],
    [/((?:^|[?&])a=[^&#\s"'\\]*&s=)[^&#\s"'\\]+/gi, `$1${REDACTED}`],
    [/([?&]s=)[^&#\s"'\\]+(?=&a=)/gi, `$1${REDACTED}`],
]

function redactText(text) {
    if (typeof text !== 'string') {
        return text
    }

    let result = text
        .replace(JSON_VALUE, `$1${REDACTED}$2`)
        .replace(NESTED_JSON_VALUE, `$1${REDACTED}$2`)
        .replace(INSPECT_VALUE, `$1'${REDACTED}'`)

    for (const [pattern, replacement] of TEXT_PATTERNS) {
        result = result.replace(pattern, replacement)
    }

    return result
}

function isPlainObject(value) {
    const proto = Object.getPrototypeOf(value)
    return proto === null || proto === Object.prototype || (value.constructor && value.constructor.name === 'Object')
}

// Returns a copy of `value` that is safe to log or show: secret keys replaced,
// secrets in strings replaced, and nothing that JSON.stringify can't handle.
// Errors become plain objects with their own properties (axios puts config,
// request and response there). Objects that aren't plain data, such as an
// XMLHttpRequest or Node's ClientRequest (whose raw headers hold the login),
// are reduced to their class name unless they define toJSON.
function redact(value, depth = 0, ancestors = new WeakSet()) {
    if (typeof value === 'string') {
        return redactText(value)
    }
    if (typeof value === 'bigint' || typeof value === 'symbol') {
        return value.toString()
    }
    if (typeof value === 'function') {
        return undefined
    }
    if (value === null || typeof value !== 'object') {
        return value
    }

    if (ancestors.has(value)) {
        return '[Circular]'
    }
    if (depth >= MAX_DEPTH) {
        return '[Object]'
    }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        return `[${value.constructor.name} ${value.byteLength} bytes]`
    }

    ancestors.add(value)
    try {
        if (Array.isArray(value)) {
            return value.map(item => redact(item, depth + 1, ancestors))
        }
        // as electron-log writes them
        if (value instanceof Map) {
            return redact(Object.fromEntries(value), depth, ancestors)
        }
        if (value instanceof Set) {
            return redact(Array.from(value), depth, ancestors)
        }

        if (value instanceof Error) {
            const result = { name: value.name, message: redactText(value.message) }
            copyEntries(value, result, depth, ancestors)
            if (value.stack) {
                result.stack = redactText(value.stack)
            }
            return result
        }

        if (!isPlainObject(value)) {
            if (typeof value.toJSON === 'function') {
                return redact(value.toJSON(), depth + 1, ancestors)
            }
            return `[${(value.constructor && value.constructor.name) || 'Object'}]`
        }

        return copyEntries(value, {}, depth, ancestors)
    } finally {
        ancestors.delete(value)
    }
}

function copyEntries(source, target, depth, ancestors) {
    for (const [key, item] of Object.entries(source)) {
        target[key] = SECRET_KEYS.has(key.toLowerCase()) ? REDACTED : redact(item, depth + 1, ancestors)
    }
    return target
}

module.exports = { REDACTED, redact, redactText }
