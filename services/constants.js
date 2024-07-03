module.exports = Object.freeze({
    DEFAULT_RECENT_UPLOAD_PROJECTS_COUNT: 3,
    MAX_RECENT_UPLOAD_PROJECTS_STORED: 10,
    MAX_UPLOAD_CONCURRENCY: 12,
    DEFAULT_UPLOAD_CONCURRENCY: 6,
    ALLOW_VISUAL_PHI_CHECK: true, // PIXEL EDITING UI switch (upload workflow)
    BULK_IMAGE_ANONYMIZATION: true, // ALLOW_VISUAL_PHI_CHECK_BULK
    UPLOAD_SELECTION_WARNING_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
    UPLOAD_CHUNKING: false, // default upload chunking setting
    MAX_UPLOAD_CHUNK_SIZE: 10, // MB
    MAX_UPLOAD_CHUNK_COUNT: 100, // 
    KEEP_ALIVE_TIMEOUT_SEC: 60, // Keep-Alive header, timeout parameter
    SOCET_TIMEOUT_SEC: 60, // Axios - A maximum time of inactivity between two data packets when exchanging data with a server.
    CLEAR_APPLICATION_CACHE_FILENAME: '__CLEAR_APP_CACHE__',
    CALCULATE_UPLOAD_CHECKSUMS: false,
    PRIMARY_MODALITIES: [
        'CR', 'CT', 'MR', 'PT', 'DX', 'ECG', 'EPS', 'ES', 'GM', 'HD', 
        'IO', 'MG', 'NM', 'OP', 'OPT', 'RF', 'SM', 'US', 'XA', 'XC', 'OT'
    ],
    DISABLE_IMAGE_ANONYMIZATION_FOR_MODALITIES: ['RTDOSE'], // all uppercase
    CSV_UPLOAD_FIELDS: [
        {
            name: "id",
            label: 'Study UID',
            editable: false,
            required: true
        },
        {
            name: "study_date",
            label: 'Study Date',
            editable: false,
            required: false
        },
        {
            name: "modality",
            label: 'Modality',
            editable: false,
            required: false
        },
        {
            name: "label",
            label: 'Study Description',
            editable: false,
            required: false
        },
        {
            name: "patient_name",
            label: 'Patient Name',
            editable: false,
            required: false
        },
        {
            name: "patient_id",
            label: 'Patient ID',
            editable: false,
            required: false
        },
        {
            name: "scan_count",
            label: 'Scans',
            editable: false,
            required: false
        },
        {
            name: "xnat_subject_id",
            label: 'XNAT Subject ID',
            editable: true,
            required: true
        },
        {
            name: "experiment_label",
            label: 'Session Label',
            editable: true,
            required: true
        },
        {
            name: "tracer",
            label: 'PET Tracer',
            editable: true,
            required: true
        }
    ]
});