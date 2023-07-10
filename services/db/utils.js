const { getApp } = require('../app_utils')
const { glob } = require('glob')
const path = require('path')
const lodashCloneDeep = require('lodash/cloneDeep')


exports.getJsonDbFiles = (dbType = '*') => {
    const app = getApp()
    const appDataDir = app.getPath('userData')
    const sha1_match = '[a-f0-9]'.repeat(40)
    const fileRegex = dbType === '*' ? `db.*.${sha1_match}.json` : `db.${dbType}.${sha1_match}.json`

    const dbPath = path.join(appDataDir, fileRegex)

    return glob.sync(dbPath)
}

function findCommonStartString(paths) {
    if (paths.length === 0) return ''
    
    // find a common path
    let common_path = paths[0];
    let searching = paths.length === 1 ? false : true;

    while (common_path.length > 0 && searching) {
        for (let j = 1; j < paths.length; j++) {
            if (paths[j].indexOf(common_path) !== 0) {
                let new_length = Math.min(paths[j].length, common_path.length - 1)
                common_path = common_path.substring(0, new_length);
                break;
            }

            // if no break has happened - we found our match
            if (j == paths.length - 1) {
                searching = false;
            }
        }
    }

    return common_path;
}

exports.getScanFilesProperty = (scan, prop) => {
    let searchProp = prop === 'filename' ? 'filepath' : prop
    let propIndex = scan.dataIndex.indexOf(searchProp)
    if (propIndex === -1) {
        return null
    }

    return scan.data.map(fileInfo => {
        if (prop === 'filename') {
            return path.basename(scan.commonPath + fileInfo[propIndex])
        } else if (prop === 'filepath') {
            return scan.commonPath + fileInfo[propIndex]
        } else {
            return fileInfo[propIndex]
        }
    })
}

exports.optimizeUploadDigest = (upload, upload_chunking_enabled, max_upload_chunk_size, max_upload_chunk_count) => {
    let _upload = lodashCloneDeep(upload)

    _upload.series = []

    for (let i = 0; i < upload.series.length; i++) {
        for (let j = 0; j < upload.series[i].length; j++) {
            if (j === 0) {
                let series_filepaths = upload.series[i].map(ser => ser.filepath)
                let upload_tpl = {
                    commonPath: findCommonStartString(series_filepaths),
                    seriesDescription: upload.series[i][0].seriesDescription,
                    seriesInstanceUid: upload.series[i][0].seriesInstanceUid,
                    seriesNumber: upload.series[i][0].seriesNumber,
                    modality: upload.series[i][0].modality,
                    bytes: 0,
                    segments: [],
                    dataIndex: [
                        "filepath",
                        "filesize",
                        "order",
                        "SOPInstanceUID",
                        "SOPClassUID",
                        "TransferSyntaxUID",
                        "PhotometricInterpretation",
                        "Rows",
                        "Columns",
                        "anon_checksum"
                    ],
                    data: []
                }
                _upload.series[i] = upload_tpl
            }

            let current_file = upload.series[i][j]
            
            _upload.series[i].data[j] = [
                current_file.filepath.substring(_upload.series[i].commonPath.length),
                current_file.filesize,
                current_file.order,
                current_file.SOPInstanceUID,
                current_file.SOPClassUID,
                current_file.TransferSyntaxUID,
                current_file.PhotometricInterpretation,
                current_file.Rows,
                current_file.Columns,
                current_file.anon_checksum || ''
            ]
        }
    }

    // calculating segments
    for (let i = 0; i < _upload.series.length; i++) {
        _upload.series[i].bytes = calcSeriesBytes(_upload.series[i])
        _upload.series[i].segments = calcSeriesSegments(_upload.series[i], upload_chunking_enabled, max_upload_chunk_size, max_upload_chunk_count)
    }

    return _upload;
}

function calcSeriesBytes(series) {
    let filesizeIndex = series.dataIndex.indexOf('filesize')

    let seriestBytes = series.data.reduce((tt, item) => {
        return tt + item[filesizeIndex];
    }, 0);

    return seriestBytes;
}

function calcSegmentBytes(series, fileSliceStart, fileSliceSize) {
    let fileSliceEnd = fileSliceStart + fileSliceSize
    let segmentData = series.data.slice(fileSliceStart, fileSliceEnd)

    let filesizeIndex = series.dataIndex.indexOf('filesize')

    let segmentBytes = segmentData.reduce((tt, item) => {
        return tt + item[filesizeIndex];
    }, 0);

    return segmentBytes;
}

function calcSeriesSegments(selected_series, upload_chunking_enabled, max_upload_chunk_size, max_upload_chunk_count) {
    let filepath_index = selected_series.dataIndex.indexOf("filepath")
    let _files = selected_series.data.map(fileInfo => selected_series.commonPath + fileInfo[filepath_index])

    if (!upload_chunking_enabled) {
        return calcSeriesSegmentsNoChunking(selected_series, _files)
    }

    let filesize_index = selected_series.dataIndex.indexOf("filesize")
    let _fileSizes = selected_series.data.map(fileInfo => fileInfo[filesize_index])

    let master = []

    const max_files = max_upload_chunk_count
    const max_size = max_upload_chunk_size * 1024 * 1024

    let running_size = 0
    let running_arr = []
    for (let i = 0; i < _files.length; i++) {
        running_size += _fileSizes[i]

        if (running_arr.length && (running_size > max_size || running_arr.length === max_files)) {
            master.push(running_arr)

            // restart running
            running_size = _fileSizes[i]
            running_arr = []
        }

        running_arr.push(i)

        if (i + 1 === _files.length) {
            master.push(running_arr)
        }
    }

    if (master.length === 0) {
        console.error({selected_series})
    }

    let segments = []
    for (let segment of master) {
        segments.push({
            status: false,
            start: segment[0],
            size: segment.length,
            bytes: calcSegmentBytes(selected_series, segment[0], segment.length)
        })
    }

    return segments;
}

function calcSeriesSegmentsNoChunking(selected_series, _files) {
    return [
        {
            status: false,
            start: 0,
            size: _files.length,
            bytes: selected_series.bytes
        }
    ]
}
