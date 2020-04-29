function selected_sessions_table($tbl, tbl_data) {
    destroyBootstrapTable($tbl);

    $tbl.bootstrapTable({
        height: tbl_data.length > 8 ? 400 : 0,
        sortName: 'patient_name',
        classes: 'table-sm',
        theadClasses: 'thead-light',
        maintainMetaData: true,
        uniqueId: 'id',
        columns: [
            {
                field: 'id',
                title: 'StudyInstanceUID',
                visible: false
            },
            {
                field: 'patient_name',
                title: 'Patient Name',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'patient_id',
                title: 'Patient ID',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'label',
                title: 'Study Description',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'modality',
                title: 'Modality',
                sortable: true,
                class: 'break-all'
            },
            {
                field: 'scan_count',
                title: 'Scans',
                sortable: true,
                class: 'right-aligned'
            },
            {
                field: 'study_date',
                title: 'Study Date',
                class: 'right-aligned',
                sortable: false,
                visible: true,
                formatter: function(value, row, index, field) {
                    return value ? value : 'N/A';
                }
            }
            
        ],
        data: tbl_data
    });

    $tbl.bootstrapTable('resetView');
}


function destroyBootstrapTable($tbl) {
    if ($.isPlainObject($tbl.bootstrapTable('getOptions'))) { // bootstrap table already initialized
        $tbl.bootstrapTable('destroy');
    }
}

module.exports = {
    selected_sessions_table: selected_sessions_table
}