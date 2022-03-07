module.exports = Object.freeze({
    DEFAULT_RECENT_UPLOAD_PROJECTS_COUNT: 3,
    MAX_RECENT_UPLOAD_PROJECTS_STORED: 10,
    ALLOW_VISUAL_PHI_CHECK: true, // PIXEL EDITING UI switch (upload workflow)
    BULK_IMAGE_ANONYMIZATION: true, // ALLOW_VISUAL_PHI_CHECK_BULK
    UPLOAD_SELECTION_WARNING_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
    PRIMARY_MODALITIES: [
        'CR', 'CT', 'MR', 'PT', 'DX', 'ECG', 'EPS', 'ES', 'GM', 'HD', 
        'IO', 'MG', 'NM', 'OP', 'OPT', 'RF', 'SM', 'US', 'XA', 'XC', 'OT'
    ],
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