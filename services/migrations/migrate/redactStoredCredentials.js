const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const firstRun = require('electron-first-run')
const electron_log = require('../../electron_log')
const { redactText } = require('../../redact')

// Versions before 3.2.8 logged failed requests together with the login,
// session cookie and CSRF token they carried (see services/redact.js), and
// stored the alias token of web-launched downloads. Remove those from what is
// already on disk: the transfer log and transfer databases, the log files, and
// the transfer-log CSVs that Save Log File left in temp.
//
// Runs once; if a file can't be cleaned, it tries again at the next start.

const tokenName = 'redact-stored-credentials'

// Text that can be part of a credential; files and lines without it are left alone.
const MAY_HOLD_SECRET = /password|secret|authorization|cookie|jsessionid|xnat_csrf|csrftoken|xnats?:\/\/|[?&]s=/i

module.exports = () => {
    if (!firstRun({ name: tokenName })) {
        return
    }

    let ok = true
    const userDataDir = app.getPath('userData')
    // NeDB files: the transfer log (db.nedb-logger.json), uploads, downloads
    // and their archives
    for (const name of listFiles(userDataDir, /^db\..+\.json$/)) {
        ok = rewriteFile(path.join(userDataDir, name), redactNedbLines) && ok
    }

    const logDir = path.dirname(electron_log.transports.file.getFile().path)
    for (const name of listFiles(logDir, /\.log$/)) {
        ok = rewriteFile(path.join(logDir, name), redactText) && ok
    }
    // electron-log 2 (up to 3.2.5) wrote its log here on Windows and Linux
    for (const name of listFiles(userDataDir, /^log(\.old)?\.log$/)) {
        ok = rewriteFile(path.join(userDataDir, name), redactText) && ok
    }

    const tempDir = app.getPath('temp')
    for (const name of listFiles(tempDir, /^user-transfer-log-\d+\.csv$/)) {
        try {
            fs.unlinkSync(path.join(tempDir, name))
        } catch (err) {
            electron_log.error(err)
            ok = false
        }
    }

    if (!ok) {
        firstRun.clear({ name: tokenName })
    }
}

function listFiles(dir, pattern) {
    try {
        return fs.readdirSync(dir).filter(name => pattern.test(name))
    } catch (err) {
        return []
    }
}

// Returns false if the file couldn't be cleaned.
function rewriteFile(file, redactContent) {
    try {
        const content = fs.readFileSync(file, 'utf8')
        if (!MAY_HOLD_SECRET.test(content)) {
            return true
        }

        const redacted = redactContent(content)
        if (redacted === content) {
            return true
        }

        // replace the file in one step, so a crash can't leave it half written
        const temp_file = `${file}.redact-tmp`
        fs.writeFileSync(temp_file, redacted)
        fs.renameSync(temp_file, file)
        electron_log.warn(`Removed stored credentials from ${file}`)
        return true
    } catch (err) {
        electron_log.error(`Could not remove stored credentials from ${file}`, err)
        return false
    }
}

// A NeDB file holds one JSON document per line. The credentials are inside
// string fields (a log entry's message and details, a download's error), where
// details can be JSON within JSON, so each line is parsed rather than matched
// as text. Lines that don't parse are matched as text.
function redactNedbLines(content) {
    return content.split('\n').map(line => {
        if (!MAY_HOLD_SECRET.test(line)) {
            return line
        }

        let doc
        try {
            doc = JSON.parse(line)
        } catch (err) {
            return redactText(line)
        }

        const redacted = JSON.stringify(redactStrings(doc))
        return redacted === JSON.stringify(doc) ? line : redacted
    }).join('\n')
}

// Changes only string values, so the documents keep their shape.
function redactStrings(value) {
    if (typeof value === 'string') {
        return redactText(value)
    }
    if (Array.isArray(value)) {
        return value.map(redactStrings)
    }
    if (value && typeof value === 'object') {
        const result = {}
        for (const [key, item] of Object.entries(value)) {
            result[key] = redactStrings(item)
        }
        return result
    }
    return value
}
