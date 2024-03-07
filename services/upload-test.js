const fs = require('fs')
const path = require('path')

const fx = require('mkdir-recursive')
const archiver = require('archiver')

const { require: nodeRequire } = require('@electron/remote')
const mizer = nodeRequire('./mizer');
// const mizer = require('../mizer')

const { file_checksum, uuidv4, promiseSerial } = require('./app_utils')
const { MizerError } = require('../services/errors');

// contexts is based on anonymization scripts and pixel anon ... unique to each series
// variables are based on transfer.anon_variables ... unique to each transfer

exports.copy_and_anonymize_segment = async (transfer, series_id, segment_index, contexts, target_path) => {
    const filePaths = getSegmentFiles(transfer, series_id, segment_index)
    const variables = await mizer.getVariables(transfer.anon_variables);

    const new_dirpath = createTargetDir(target_path);
    
    const archive = initArchive(new_dirpath)

    function filepathsPromiseGenerator(filePaths) {
        // clone ...  contexts
        // 
        return filePaths.map(filePath => copyAnonArchive(filePath, new_dirpath, archive, contexts, variables))
    }

    async function retryAsyncOperation(maxRetries) {
        let attempt = 1;
    
        async function tryAsyncOperation(funcs) {
            try {
                const filesWithErrors = await promiseSerial(funcs);
                console.log(`${attempt}. Errors: `, filesWithErrors)
                
                if (filesWithErrors.length === 0) {
                    console.log(`SUCCESS in ${attempt}. attempt`);

                    // finalize the archive (ie we are done appending files but streams have to finish yet)
                    // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
                    archive.finalize();

                    return true;
                } else if (attempt < maxRetries) {
                    console.log(`Attempt ${attempt} FAILED`, {filesWithErrors});

                    attempt++;
                    return await tryAsyncOperation(filepathsPromiseGenerator(filesWithErrors));
                } else {
                    console.log('ABORT');

                    archive.abort();
                    return false;
                }
            } catch (error) {
                console.error('Error:', error);

                archive.abort();
                return false;
            }
        }
    
        return await tryAsyncOperation(filepathsPromiseGenerator(filePaths));
    }

    const success = await retryAsyncOperation(20);
    console.log('Was operation successful?', success);

    return success
}

function createTargetDir(target_path) {
    let dirCreated = false;
    let new_dirpath
    while (!dirCreated) {
        new_dirpath = path.join(target_path, `dir_${uuidv4()}`);

        try {
            fx.mkdirSync(new_dirpath);
            dirCreated = true
            console.log(`DIR Created: ${new_dirpath}`)
        } catch (err) {
            console.error(`DIR NOT Created: ${new_dirpath}`)
            throw err
        }
    }

    return new_dirpath
}

function promiseSerialErrorHandler(err) {
    console.error('anon failed', err)
    archive.abort() // removing any pending queue tasks, ends both sides of the Transform stream
}

function getSegmentFiles(transfer, series_id, segment_index) {
    const selectedSeriesIndex = transfer.series.findIndex(ss => series_id === ss.seriesInstanceUid);
    const selected_series = transfer.series[selectedSeriesIndex]
    
    let filepath_index = selected_series.dataIndex.indexOf('filepath')
    let _files = selected_series.data.map((fileInfo, dataIndex) => {
        return {
            transfer_id: transfer.id,
            series_index: selectedSeriesIndex,
            data_index: dataIndex,
            source: selected_series.commonPath + fileInfo[filepath_index]
        }
    })

    let fstart = selected_series.segments[segment_index].start
    let fend = fstart + selected_series.segments[segment_index].size

    return _files.slice(fstart, fend)
}


function initArchive(target_path) {
    const zipOutput = path.join(target_path, 'stream.zip')
    console.log({zipOutput});
    const output = fs.createWriteStream(zipOutput);

    /**************************************************** */
    /**************************************************** */
    let archive = archiver('zip', {
        zlib: { level: 6 } // Sets the compression level.
    });


    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function (err) {
        console.error(err)
    });

    // good practice to catch this error explicitly
    archive.on('error', function (err) {
        console.log('anon archiver error', err)
    });

    // Fires when the entry's input has been processed and appended to the archive.
    archive.on('entry', async (entry_data) => {
        /*
        fs.unlink(entry_data.sourcePath, (err) => {
            if (err) {
                console.error(err)
            } else {
                console.log(`-- ZIP file "${entry_data.sourcePath}" was deleted.`);
            }
        });
        */
    })
    /**************************************************** */
    /**************************************************** */

    output.on('close', function() {
        console.log(archive.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');
    });

    // pipe archive data to the file
    archive.pipe(output);

    return archive
}


function copyAnonArchive(fileData, new_dirpath, archive, contexts, variables) {

    const source = typeof fileData === "string" ? fileData : fileData.source

    return function() {
        return new Promise((resolve, reject) => {
            const sourceFilename = path.basename(source)
            const sourceFilenameExt = path.extname(source)
            // calculate target path            
            let target = path.join(new_dirpath, sourceFilename);

            while (fs.existsSync(target)) {
                target = path.join(new_dirpath, `${sourceFilename}.${uuidv4()}${sourceFilenameExt}`);
            }
            // -- calculate target path 

            let readStream = fs.createReadStream(source);

            
            // TODO - handle source read error
            readStream.once('error', (error) => {
                console.error(`ReadStream_error:`, {source, target, error});
                resolve(source)
                // reject(`Anonimization failed XXX. File: ${source}`)
            });
            
    
            let writeStream = fs.createWriteStream(target);
            writeStream.on('drain', () => {
                //console.log('writeStream__drain')
            })
    
            writeStream.on('error', (err) => {
                console.error('writeStream ERROR', {source, target, err})
                reject(`Anonimization failed XXX. File: ${target}`)
            })
    
            writeStream.on('finish', async () => {
                try {
                    // if file wasn't copied for whatever reason
                    if (!fs.existsSync(target)) {
                        console.log('COPY ERROR', {source, target})
                        //fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
                        fs.writeFileSync(target, fs.readFileSync(source), 'wx')
                    }
    
                    await mizer.anonymize(target, contexts, variables);
                    console.log('CUSTOM_JAVA_VARS', {contexts, variables});
                    console.count('anonymized')
                    
                    // fileData.anon_checksum = await file_checksum(target)

                    archive.file(target, { name: path.basename(target) });

                    resolve(false)
    
                } catch (error) {
                    console.log('copy/anonymization ERROR', {source, target})
                    console.error(error);

                    if (mizer.isMizerError(error.message)) {
                        console.log('MizerError')
                        reject(new MizerError(error.message, source));
                    } else if (error.message && (error.message.indexOf('java.util.ConcurrentModificationException') >= 0 || error.message.indexOf('java.lang.NullPointerException') >= 0)) {
                        console.log('CUSTOM_JAVA_ERROR: ', error.message)
                        console.log('CUSTOM_JAVA_ERROR_VARS', {contexts, variables});
                        // reject(new MizerError(error.message, source));
                        fs.unlink(target, (err) => {
                            if (err) {
                                console.error(err)
                            }
                            resolve(source)
                        });
                        
                    } else {
                        console.log('CUSTOM_JAVA_ERROR2: ', error.message)
                        fs.unlink(target, (err) => {
                            if (err) {
                                console.error(err)
                            }
                            resolve(source)
                        });
                    }
                }
    
            });
    
            readStream.pipe(writeStream);
        })
    }
}

