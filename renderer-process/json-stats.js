const { ipcRenderer } = require('electron');
const { require: nodeRequire, app } = require('@electron/remote')

const path = require('path')
const fs = require('fs')
const bytes = require('bytes')
const swal = require('sweetalert')

const ejs_template = require('../services/ejs_template')

const db_uploads = nodeRequire('./services/db/uploads')
const db_uploads_archive = nodeRequire('./services/db/uploads_archive')
const db_downloads = nodeRequire('./services/db/downloads')
const db_downloads_archive = nodeRequire('./services/db/downloads_archive')

const dom_context = '#json-stats'
const { $$, $on } = require('../services/selector_factory')(dom_context)

async function populateJsonDbData(confirm = false) {
    let databases = [db_uploads, db_uploads_archive, db_downloads, db_downloads_archive]

    let dbData = await Promise.all(
        databases.map(async (db) => {
            let filepath = db().persistence.filename
            let basename = path.basename(filepath)
            let name = basename.split('.')[1]
            let filesize = getFilesizeInBytes(filepath)
            let filesizeHuman = bytes(filesize, {decimalPlaces: 0, unitSeparator: ' '})
            let dbCount = await coundDbItems(db);
            
            return {
                filepath,
                basename,
                name,
                filesize,
                filesizeHuman,
                dbCount
            }
        })
    )

    let tpl_html = await ejs_template('json-stats/table', { dbData: dbData })

    $$('#db-table').html(tpl_html)

    if (confirm) {
        Helper.pnotify(null,  `Database table is refreshed.`)
    }
}

function coundDbItems(db) {
    return new Promise((resolve, reject) => {
        db().count({}, function(err, count) {
            if (err) {
                resolve('?')
            }

            resolve(count)
        })
    })
}

function getFilesizeInBytes(filename) {
    let stats = fs.statSync(filename);
    let fileSizeInBytes = stats.size;
    return fileSizeInBytes;
}

function clearDatabase(db) {
    let dbName = path.basename(db().persistence.filename).split('.')[1]

    db().remove({}, { multi: true }, function (err, numRemoved) {
        if (err) throw err

        let recordsLabel = numRemoved === 1 ? 'record' : 'records'
        Helper.pnotify(null,  `${dbName} cleared.  ${numRemoved} ${recordsLabel} removed.`)

        db().persistence.compactDatafile()
        db().once('compaction.done', function() {
            populateJsonDbData()
        })
    })
}

// ******************************************************************************
// ******************************************************************************

$on('page:load', dom_context, async function(e){
    $$('#user-data-path').text(app.getPath('userData'))
    populateJsonDbData()
})

$on('click', '[data-js-table-reload]', async function(e){
    e.preventDefault()
    populateJsonDbData(true)
})

$on('click', '#user-data-path', (e) => {
    e.preventDefault()
    ipcRenderer.send('shell.showItemInFolder', app.getPath('userData') + '/.')
})

$on('click', '[data-js-db-filepath]', function(e) {
    e.preventDefault()
    let dbPath = $(this).data('js-db-filepath')
    ipcRenderer.send('shell.showItemInFolder', dbPath)
})

$on('click', '[data-js-empty-db]', async function(e) {
    e.preventDefault()
    let dbName = $(this).data('js-empty-db')

    const proceed = await swal({
        title: `Empty (${dbName}) database?`,
        text: `This action cannot be undone.`,
        icon: "error",
        buttons: ['Cancel', 'Empty Database'],
        dangerMode: true
    })

    if (proceed) {
        switch (dbName) {
            case "uploads":
                clearDatabase(db_uploads)
                break
            case "uploads_archive":
                clearDatabase(db_uploads_archive)
                break
            case "downloads":
                clearDatabase(db_downloads)
                break
            case "downloads_archive":
                clearDatabase(db_downloads_archive)
                break
        }
    }
})

$on('click', '[data-js-empty-dbs]', async function(e) {
    e.preventDefault()
    
    const proceed = await swal({
        title: `Empty All Databases?`,
        text: `This action cannot be undone.`,
        icon: "error",
        buttons: ['Cancel', 'Empty Databases'],
        dangerMode: true
    })

    if (proceed) {
        let databases = [db_uploads, db_uploads_archive, db_downloads, db_downloads_archive]

        databases.forEach((db) => {
            clearDatabase(db)
        })
    }
})
