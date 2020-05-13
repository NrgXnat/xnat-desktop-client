const fs = require('fs')
const path = require('path');
const archiver = require('archiver');

const remote = require('electron').remote;

const { file_checksum } = remote.require('./services/app_utils');
const mizer = remote.require('./mizer');

const { uuidv4 } = require('./../app_utils');

const filePromiseChain = (funcs) => {
    const reducer = (promise, func) => {
        return promise.then(result => {
            return func()
                .then(resp => {
                    result.success.push(resp.file)
                    if (resp.copy) {
                        result.copies.push(resp.copy)
                    }
                    
                    return result
                })
                .catch(err => {
                    result.fail.push(err.file)
                    if (err.copy) {
                        result.copies.push(err.copy)
                    }
                    
                    return result
                })
        })
    }

    return funcs.reduce(reducer, Promise.resolve({
        success: [],
        fail: [],
        copies: []
    }))
}

const get_unique_copy_path = (file, target_dir) => {
    // Returns:
    // { root: '/',
    //   dir: '/home/user/dir',
    //   base: 'file.txt',
    //   ext: '.txt',
    //   name: 'file' }
    let file_path = path.parse(file);

    let target = path.join(target_dir, (uuidv4() + file_path.ext));
    while (fs.existsSync(target)) {
        target = path.join(target_dir, (uuidv4() + file_path.ext));
    }

    return target;
}

const copy_file = (file, target_dir) => {
    return new Promise((resolve, reject) => {
        let target = get_unique_copy_path(file, target_dir)

        let fileReadStream = fs.createReadStream(file);
        fileReadStream
            .on('error', (err) => {
                console.log(`An error occurred trying to read "${file}"`); 
                reject({
                    err: err,
                    copy: target
                })
            })
        
        let copyWriteStream = fs.createWriteStream(target);
        copyWriteStream
            .on('error', (err) => {
                console.log('writeStream ERROR', err)
                reject({
                    err: err,
                    copy: target
                })
            })
            .on('close', () => {
                console.log(`copy_file(${file}, ${target})`);
                resolve(target)
            })
    
        fileReadStream.pipe(copyWriteStream);
    })
}

const anonymize_copy = (copy_path, contexts, variables) => {
    return new Promise((resolve, reject) => {
        try {
            mizer.anonymize(copy_path, contexts, variables);
            console.count('anonymized')

            resolve(copy_path)
        } catch(err) {
            console.log(`ERROR: anonymize_copy(${path.basename(copy_path)})`)
            reject({err, copy: copy_path})
        }
    })
}

const calculate_checksum = async (copy_path, file_path, anon_file_checksums) => {
    const anon_checksum = await file_checksum(copy_path)

    anon_file_checksums.push({
        source: file_path,
        anon_checksum
    })

    return copy_path
}

const add_to_archive = (file_path, original, archive) => {
    return new Promise((resolve, reject) => {
        try {
            archive.file(file_path, { name: path.basename(original) });
            console.log(`add_to_archive(${path.basename(file_path)})`);
            resolve(file_path)
        } catch(err) {
            console.log(`ERROR: add_to_archive(${path.basename(file_path)})`)
            reject({
                err: err,
                copy: file_path
            })
        }
    })
}

const all_file_tasks = (file_path, target_dir, archive, contexts, variables, anon_file_checksums) => {
    return () => {
        return new Promise((resolve, reject) => {
            copy_file(file_path, target_dir)
                .then(copy_path => {
                    return anonymize_copy(copy_path, contexts, variables) // promise (anonymize)
                })
                .then(async (copy_path) => {
                    return calculate_checksum(copy_path, file_path, anon_file_checksums)
                })
                .then(copy_path => {
                    return add_to_archive(copy_path, file_path, archive)
                })
                .then(copy_path => {
                    console.log(`DONE: all_file_tasks(${path.basename(file_path)})`);
                    resolve({
                        file: file_path,
                        copy: copy_path
                    })
                })
                .catch((err) => {
                    if (err.copy && fs.existsSync(err.copy)) {
                        fs.unlink(err.copy, (unlink_err) => {
                            if (unlink_err) throw unlink_err;
                            console.log(`+++ XXX ERROR => Deleted ${path.basename(err.copy)}`);
                        });
                    }

                    reject({
                        file: file_path,
                        copy: err.copy
                    })
                })
        })
        
    }
}


function copy_anonymize_zip(_files, destination, contexts, variables) {
    let zip_destination = path.join(destination, Date.now() + '.zip');

    if (_files.length === 0) {
        return Promise.reject('No files passed to copy_anonymize_zip()!')
    }

    return new Promise((resolve, reject) => {
        let success, _error, remove_files = [], anon_file_checksums = [];
        // *********************************************************
        // *********************************************************

        // ---------------------------------------------------------------------------------------------
        let archive = archiver('zip', {
            zlib: { level: 6 } // Sets the compression level.
        });

        // good practice to catch warnings (ie stat failures and other non-blocking errors)
        archive.on('warning', function (err) {
            console.log('archive.on.warning');
            throw err;
        });

        // good practice to catch this error explicitly
        archive.on('error', function (err) {
            console.log('archive.on.error');
            throw err;
        });

        archive.on('entry', function (entry_data) {
            console.log(`archive.on('entry'): ${entry_data.sourcePath}`);
            console.log('*************************************************');
            fs.unlink(entry_data.sourcePath, (err) => {
                if (err) throw err;
            });
        })

        // create a file to stream archive data to.
        var output = fs.createWriteStream(zip_destination);

        output.on('error', (err) => {
            console.log('1111   output ERROR', err)
            throw err;
        })
        
        // listen for all archive data to be written
        // 'close' event is fired only when a file descriptor is involved
        output.on('close', function() {
            console.log(archive.pointer() + ' total bytes');
            console.log('1111   archiver has been finalized and the output file descriptor has closed.');

            console.log({success});

            if (success) {
                resolve({
                    path: output.path,
                    checksums: anon_file_checksums
                })
            } else {
                remove_files.map(file => {
                    if (fs.existsSync(file)) {
                        fs.unlink(file, (unlink_err) => {
                            if (unlink_err) throw unlink_err;
                            console.log(`+++ ZZZ ERROR => Deleted ${path.basename(file)}`);
                        });
                    }
                })

                fs.unlink(output.path, (err) => {
                    if (err) {
                        console.log({unlink_zip_error: err})
                        throw err
                    }
    
                    console.log(`ZIP FILE REMOVED ${path.basename(output.path)}`);

                    reject(_error)
                })
            }
            
        });

        // This event is fired when the data source is drained no matter what was the data source.
        // It is not part of this library but rather from the NodeJS Stream API.
        // @see: https://nodejs.org/api/stream.html#stream_event_end
        output.on('end', function() {
            console.log('1111   Data has been drained');
        });


        // pipe archive data to the file
        archive.pipe(output);

        // **********************************************************************************************
        // **********************************************************************************************
        const file_tasks = (files) => {
            return files.map((file) => all_file_tasks(file, destination, archive, contexts, variables, anon_file_checksums))
        }


        filePromiseChain(file_tasks(_files))
            .then(processed_files => {
                console.log({processed_files});

                let error_files = processed_files.fail;

                if (error_files.length === 0) {
                    archive.finalize();
                    success = true;
                } else {
                    archive.abort(); // if we use archive.abort() we have to explicitlly remove files added to queue
                    success = false;

                    remove_files = processed_files.copies
                    
                    // treba obrisati fajlove ili probati ponovo
                    
                    _error = `Error files: \n${error_files.join(`,\n`)}`
                }
            })
            .catch(err => {
                archive.finalize(); // if we use archive.abort() we have to explicitlly remove files added to queue
                success = false;
                _error = err
            })

    })

}


/*
Usage:

copy_modify_zip(_files, destination)
    .then(archive_path => {})
    .catch(err => {})

*/

module.exports.copy_anonymize_zip = copy_anonymize_zip;