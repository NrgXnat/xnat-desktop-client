const { ipcRenderer, remote } = require('electron');
const app = remote.app
const store = require('store2')

const { glob } = require('glob')
const path = require('path')
const fs = require('fs')
const bytes = require('bytes')
const swal = require('sweetalert')


const ElectronStore = require('electron-store')
const settings = new ElectronStore()
const auth = require('../services/auth')
const sha1 = require('sha1')

const db_uploads = remote.require('./services/db/uploads')

const dom_context = '#json-stats'
const { $$, $on } = require('../services/selector_factory')(dom_context)

let maxUploadSizeMB;

$on('page:load', dom_context, function(e){
    $$('#user-data-path').text(app.getPath('userData'))

    populateJsonDbData()
})

// setInterval(populateJsonDbData, 2000)

function populateJsonDbData() {
    $$('#json-files').html('')
    const dbFiles = getJsonDbFiles()

    for (let i = 0; i < dbFiles.length; i++) {
        let fileSize = getFilesizeInBytes(dbFiles[i]);
        let badgeClass = fileSize > 0 ? 'badge-success' : 'badge-light'
        $$('#json-files').append(`<li><span style="width: 70px; text-align: right;" class="badge ${badgeClass}">${bytes(fileSize)}</span> ${path.basename(dbFiles[i])}</li>`)
    }
    $$('#json-files').append(`<li style="font-size: 0.7em">Rand seed: ${Math.random()}</li>`)
}

$on('click', '#user-data-path', (e) => {
    e.preventDefault()
    ipcRenderer.send('shell.showItemInFolder', app.getPath('userData') + '/.')
})

$on('click', '#add-upload', async () => {
    // db_uploads.listAll((err, uploads) => {
    //     let canceled_items = uploads.filter(item => item.canceled)
    //     console.log({canceled_items});

    //     canceled_items[0].

    //     $$('#jsonx').text(JSON.stringify(canceled_items[0]))
    // })

    maxUploadSizeMB = null;
    await addUpload(15, 1000)
})

$on('click', '#clear-upload', async () => {
    await clearUploadDb()
})

async function addUpload(numOfSeriesPerSession = 20, numOfFilesPerSeries = 700) {
    if (maxUploadSizeMB === null) {
        const uploadsFileSizeMB = getFilesizeInBytes(getDbFilePath('uploads')) / 1024 / 1024

        const maxSize = await swal(`Fill Upload with this much MB of content (number between ${uploadsFileSizeMB.toFixed(2)} and 3000):`, {
            content: "input",
        })
    
        const realSize = parseInt(maxSize) || 0
    
        if (realSize > 3000 || realSize < uploadsFileSizeMB) {
            await swal(`Invalid size: ${realSize}MB`);
            return
        } else {
            await swal(`You typed: ${maxSize} ---> ${realSize}MB`);
            maxUploadSizeMB = realSize
        }
    }
    
    const id = Helper.uuidv4(),
            session_id = Helper.uuidv4()


    let series = generateSeriesData(numOfSeriesPerSession, numOfFilesPerSeries)
    let table_rows = generateTableRows(series)
    let series_ids = getSeriesIds(series)
    let pixel_anon_data = generatePixelAnonData(series)

    let upload_digest = {
        _id: uid(16),
        id: id,
        url_data: {
            expt_label: "DUMMY_1_PIB_1",
            project_id: "DUMMY_PROJECT",
            subject_id: "DUMMY_1"
        },
        anon_variables:  {
            "session": "DUMMY_1_PIB_1",
            "project": "DUMMY_PROJECT",
            "subject": "DUMMY_1",
            "pet_tracer": "PIB",
            "experiment_label": "DUMMY_1_PIB_1",
            "tracer": "PIB"
        },
        session_id: session_id,
        session_data:  {
            "studyId": "-",
            "studyInstanceUid": session_id,
            "studyDescription": "PANC. avec C.A.  PRIMAIRE -TP",
            "modality": [
                "RTSTRUCT",
                "CT",
                "PT",
                "RTDOSE"
            ],
            "accession": "1369680135544647",
            "studyDate": "1885-08-27",
            "studyTime": "11:11:11"
        },
        series_ids: series_ids,
        series: series,
        //_files: _files,
        pixel_anon: pixel_anon_data,
        total_size: 777,
        //user_auth: user_auth,
        xnat_server: settings.get('xnat_server'),
        user: auth.get_current_user(),
        transfer_start: Helper.unix_timestamp(),
        table_rows: table_rows,
        status: 0,
        canceled: true
    };

    // console.log({upload_digest});

    //$$('#jsonx').text(JSON.stringify(upload_digest).length)
    
    const dbPath = getDbFilePath('uploads')

    /*
    fs.appendFile(dbPath, JSON.stringify(upload_digest) + "\n", async function (err) {
        if (err) throw err
        console.log('Saved!')
        populateJsonDbData()

        if (getFilesizeInBytes(dbPath) > maxUploadSizeMB * 1024 * 1024) {
            app.relaunch()
            app.exit()
        } else {
            await addUpload(numOfSeriesPerSession, numOfFilesPerSeries)
        }
    });
    */
	
	
    const newItem = await db_uploads._insertDoc(upload_digest)
    console.log('Great Success');

    populateJsonDbData()

    if (getFilesizeInBytes(dbPath) > maxUploadSizeMB * 1024 * 1024) {
        // console.log({newItem});
        console.log('Done')
    } else {
        await addUpload(numOfSeriesPerSession, numOfFilesPerSeries)
    }
    
}

async function clearUploadDb() {
    let willDelete = await swal({
        title: "Are you sure?",
        text: "This will delete all the content in the upload transfer list!",
        buttons: true,
        dangerMode: true,
    })

    if (willDelete) {
        await swal("The application will restart after clearing the upload list.")
    } else {
        return;
    }
      

    fs.writeFile(getDbFilePath('uploads'), '', err => {
        if (err) throw err;

        app.relaunch()
        app.exit()
    })
}

function getDbFilePath(dbFile) {
    let xnat_server = settings.get('xnat_server');
    let username = auth.get_current_user();
    let db_sha1 = sha1(xnat_server + username)

    const appDataDir = app.getPath('userData')
    return path.join(appDataDir, `db.${dbFile}.${db_sha1}.json`)
}

function generatePixelAnonData(series) {
    let pixel_anon_data = []

    for (let i = 0; i < series.length; i++) {
        let pixel_anon_data_tpl = {
            series_id: series[i][0].seriesInstanceUid,
            rectangles: generateRectangles(5)
        }

        pixel_anon_data.push(pixel_anon_data_tpl)
    }

    return pixel_anon_data
}

function generateRectangles(totalRectangles = 2) {
    let rectangles = []
    
    for (let i = 0; i < totalRectangles; i++) {
        let x = Math.random() * 10
        let y = Math.random() * 20
        let rectangle = [x, y, x + i, y + i]

        rectangles.push(rectangle)
    }

    return rectangles
}

function getSeriesIds(series) {
    let series_ids = []
    for (let i = 0; i < series.length; i++) {
        series_ids.push(series[i][0].seriesInstanceUid)
    }

    return series_ids
}

function generateTableRows(series) {
    let table_rows = []
    for (let i = 0; i < series.length; i++) {
        table_rows.push({
            id: Helper.uuidv4(),
            series_number: series[i][0].seriesNumber,
            series_id: series[i][0].seriesInstanceUid,
            description: `Some random/dummy series description`,
            progress: 0,
            count: series[i].length,
            size: 999999999
        })
    }

    return table_rows
}

function generateSeriesData(seriesCount = 10, filePerSeries = 1000) {
    let series = []

    for (let i = 0; i < seriesCount; i++) {
        series.push(generateOneSeries(filePerSeries))
    }

    return series;
}

function generateOneSeries(fileCount = 1000) {
    const series_id = Helper.uuidv4()

    let oneSeries = []

    for (let i = 0; i < fileCount; i++) {
        let filename = `file-${i}.dcm`

        let singleSeriesTemplate = {
            "filepath": `/Some/Random/Path/That/Is/Long/Enough/ToOccupy/AsMuch/Space/AsPossible/${series_id}/${filename}`,
            "filename": filename,
            "filesize": 999999999,
            "order": 1,
            "seriesDescription": "Standard/Full",
            "seriesInstanceUid": series_id,
            "seriesNumber": `${i + 1}`,
            "modality": "CT",
            "SOPInstanceUID": "1.3.6.1.4.1.14519.5.2.1.5168.2407.244903631947320588538316435782",
            "SOPClassUID": "1.2.840.10008.5.1.4.1.1.2",
            "TransferSyntaxUID": "1.2.840.10008.1.2",
            "PhotometricInterpretation": "MONOCHROME2",
            "Rows": 512,
            "Columns": 512
        }

        oneSeries.push(singleSeriesTemplate)
    }

    return oneSeries
    
}



function getJsonDbFiles() {
    let xnat_server = settings.get('xnat_server');
    let username = auth.get_current_user();

    let db_sha1 = sha1(xnat_server + username)

    const appDataDir = app.getPath('userData')
    const dbPath = path.join(appDataDir, `db.*.${db_sha1}.json`)
    //const dbPath = path.join(appDataDir, `db.*.json`)

    return glob.sync(dbPath)
}

function getFilesizeInBytes(filename) {
    let stats = fs.statSync(filename);
    let fileSizeInBytes = stats.size;
    return fileSizeInBytes;
}


var crypto = require('crypto')
function uid (len) {
  return crypto.randomBytes(Math.ceil(Math.max(8, len * 2)))
    .toString('base64')
    .replace(/[+\/]/g, '')
    .slice(0, len);
}