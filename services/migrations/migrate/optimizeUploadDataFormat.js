require('../../db/nedb_compat')
const Datastore = require('nedb')
const { getJsonDbFiles, optimizeUploadDigest } = require('../../db/utils')
const electron_log = require('../../electron_log');

module.exports = async () => {
    const db_paths = getJsonDbFiles('uploads');

    for(let i = 0; i < db_paths.length; i++) {
        let db_uploads = new Datastore({ filename: db_paths[i], autoload: true });
        
        db_uploads.find({}, (err, docs) => {
            if (err) {
                electron_log.error(err);
                return
            }

            if (docs.length && Array.isArray(docs[0].series[0])) {
                // do migration

                for (let j = 0; j < docs.length; j++) {
                    let optimizedSession = optimizeUploadDigest(docs[j])

                    db_uploads.update({id: optimizedSession.id}, optimizedSession, {})
                }
                
                db_uploads.persistence.compactDatafile()

                electron_log.info(`DB updated: ` + db_paths[i])
                
            } else {
                electron_log.info(`DB fine: ` + db_paths[i]);
            }
        })
    }
}
