const { file_checksum, uuidv4, isEmptyObject, promiseSerial, arrayUnique, isDevEnv, currentVersionChannel, getFilesizeInBytes } = require('./app_utils')
const CONSTANTS = require('./constants');
const ElectronStore = require('electron-store');
const settings = new ElectronStore();

global.shared = {
    _queue_: {
        items: [],
        _processed: [],
        add: function(transfer_id, series_id, segment_index) {
            if (this.queueNotFull()) {
                let transfer_label = `${transfer_id}::${series_id}||${segment_index}`;
                if (this.items.indexOf(transfer_label) == -1) {
                    if (this.isInProcessed(transfer_label)) {
                        return false;
                    }
    
                    this.items.push(transfer_label);

                    return true;
                } else {
                    return false;
                }
            } else {
                return false;
            }
        },
        remove: function(transfer_id, series_id, segment_index) {
            let transfer_label = `${transfer_id}::${series_id}||${segment_index}`;
            let index = this.items.indexOf(transfer_label);
          
            if (index > -1) {
                this.items.splice(index, 1);
            }
        },
        remove_many: function(transfer_id) {
            this.items = this.items.filter(single => single.indexOf(`${transfer_id}::`) !== 0)
        },
        get_max_items: function() {
            return settings.get('upload_concurrency', CONSTANTS.DEFAULT_UPLOAD_CONCURRENCY);
        },
        queueNotFull: function () {
            return this.items.length < this.get_max_items()
        },
        isInProcessed: function(transfer_label) {
            return this._processed.includes(transfer_label)
        },
        addProcessed: function(transfer_id, series_id, segment_index) {
            let transfer_label = `${transfer_id}::${series_id}||${segment_index}`;
            this._processed.push(transfer_label);
        },
        removeProcessedTransfer: function(transfer_id) {
            this._processed = this._processed.filter(single => single.indexOf(`${transfer_id}::`) !== 0)
        },
        getProcessedTransferSeries: function(transfer) {
            let transfer_id = transfer.id
            let processedSeriesSegments = this._processed.reduce((processed, label) => {
                if (label.indexOf(`${transfer_id}::`) === 0) {
                    processed.push(label.split(/::/)[1])
                }
                return processed;
            }, [])
    
            processedSeriesSegments = arrayUnique(processedSeriesSegments)
    
            let processedSeriesSegmentSizes = {};
            for(let seriesSegment of processedSeriesSegments) {
                let series_id = seriesSegment.split(/\|\|/)[0]
                processedSeriesSegmentSizes[series_id] = processedSeriesSegmentSizes[series_id] ? ++processedSeriesSegmentSizes[series_id] : 1;
            }
    
            // get segments sizes for each series within a session/transfer
    
            let seriesSegmentLengths = transfer.series.map(serie => {
                return {
                    series_id: serie.seriesInstanceUid,
                    segmentSize: serie.segments.length
                }
            })
    
            let fullyProcessedSeries = []
            for (let series_id in processedSeriesSegmentSizes) {
                let found_segment = seriesSegmentLengths.find(item => item.series_id === series_id)
    
                if (found_segment && found_segment.segmentSize === processedSeriesSegmentSizes[series_id]) {
                    fullyProcessedSeries.push(series_id)
                }
            }
    
            return fullyProcessedSeries;
        }
    }
};

global.windows = {
    upload: [],
    download: [],
    add: function (windowId, windowType = 'upload') {
        this[windowType].push(windowId)
    },
    remove: function (windowId, windowType = 'upload') {
        const windowIndex = this[windowType].indexOf(windowId)
        
        if (windowIndex > -1) {
            this[windowType].splice(windowIndex, 1);
        }
    }
}

global.user_auth = {
    username: null,
    password: null
};

module.exports = global