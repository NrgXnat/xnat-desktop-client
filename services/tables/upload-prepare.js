const ipcRenderer = require('electron').ipcRenderer;

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
                visible: false
            },
            {
                field: 'xnat_subject_id',
                title: 'XNAT SUBJECT ID',
                sortable: true,
                class: 'break-all highlight'
            },
            {
                field: 'label',
                title: 'Study Id',
                sortable: true,
                width: 200,
                class: 'break-all'
            },
            {
                field: 'experiment_label',
                title: 'XNAT Session Label',
                sortable: true,
                class: 'break-all highlight'
            },
            {
                field: 'study_date',
                title: 'Study Date',
                class: 'right-aligned',
                visible: true,
                formatter: function(value, row, index, field) {
                    return value ? value : 'N/A';
                }
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
            }
            
        ],
        data: tbl_data
    });

    $tbl.bootstrapTable('resetView');
}

function custom_upload_multiple_table($tbl, tbl_data) {
    destroyBootstrapTable($tbl);
    
    const pt_count = tbl_data.reduce((total, item) => {
        return total += (item.modality === 'PT' ? 1 : 0)
    }, 0)

    window.customMultipleUploadTracerChange = {
        'input .tracer-field': function (e, value, row, index) {
            row.tracer = $(e.target).val()
            ipcRenderer.send('custom_upload_multiple:generate_exp_label', row)
        }
    }

    window.customMultipleUploadSubjectChange = {
        'input .subject-field': function (e, value, row, index) {
            row.xnat_subject_id = $(e.target).val()
            if ($('#subject_labeling_pattern').val() === 'auto') {
                ipcRenderer.send('custom_upload_multiple:generate_exp_label', row)
            }

            $('#subject_labeling_pattern').val('manual')
        }
    }

    window.customMultipleUploadLabelChange = {
        'input .label-field': function (e, value, row, index) {
            row.experiment_label = $(e.target).val()

            $('#session_labeling_pattern').val('manual')
        }
    }

    function setRowInputRequiredStatus(row, $element) {
        const $inputs = $element.closest('tr').find('input[type="text"]')
        
        $inputs.each(function() {
            $(this).prop('required', row.enabled)
        })
    }

    function setTableInputRequiredStatus(rowsAfter, rowsBefore) {
        const $inputs = $tbl.find('input[type="text"]')
        
        $inputs.each(function() {
            const enabled = rowsAfter.length > 0
            $(this).prop('required', enabled)
        })
    }


    $tbl.bootstrapTable({
        height: tbl_data.length > 8 ? 400 : 0,
        sortName: 'patient_name',
        classes: 'table-sm bootstrap-table-small',
        //theadClasses: 'thead-light',
        maintainMetaData: true,
        uniqueId: 'id',
        onCheck: setRowInputRequiredStatus,
        onUncheck: setRowInputRequiredStatus,
        onCheckAll: setTableInputRequiredStatus,
        onUncheckAll: setTableInputRequiredStatus,
        columns: [
            {
                field: 'enabled',
                checkbox: true,
                align: 'center',
                valign: 'middle'
            },
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
                visible: false
            },
            {
                field: 'subject_auto',
                title: 'Sub Auto',
                visible: false
            },
            {
                field: 'subject_dicom_patient_name',
                title: 'Sub P.Name',
                visible: false
            },
            {
                field: 'subject_dicom_patient_id',
                title: 'Sub P.ID',
                visible: false
            },
            {
                field: 'xnat_subject_id',
                title: 'XNAT SUBJECT ID',
                events: 'customMultipleUploadSubjectChange',
                sortable: true,
                class: 'break-all highlight',
                formatter: function(value, row, index, field) {
                    return `<input required type="text" name="xnat_subject_id--${row.patient_id}" value="${value}" class="subject-field form-control form-control-sm" />`
                }
            },
            {
                field: 'label',
                title: 'Study Id',
                sortable: true,
                width: 200,
                class: 'break-all'
            },
            {
                field: 'tracer',
                title: 'Tracer',
                events: 'customMultipleUploadTracerChange',
                visible: pt_count > 0,
                class: 'highlight',
                formatter: function(value, row, index, field) {
                    const field_val = value ? value : ''
                    return row.modality === 'PT' ? `<input required type="text" name="tracer--${row.patient_id}" size="4" value="${field_val}" class="tracer-field form-control form-control-sm" />` : '';
                }
            },
            {
                field: 'study_date',
                title: 'Study Date',
                class: 'right-aligned',
                visible: true,
                formatter: function(value, row, index, field) {
                    return value ? value : 'N/A';
                }
            },
            {
                field: 'modality',
                title: 'Modality',
                sortable: true,
                class: 'break-all',
                visible: false
            },
            {
                field: 'scan_count',
                title: 'Scans',
                sortable: true,
                class: 'right-aligned'
            },
            {
                field: 'session_accession',
                title: 'Sess Acc',
                visible: false
            },
            {
                field: 'label_suffix',
                title: 'Label Suffix',
                visible: false
            },
            {
                field: 'experiment_label',
                title: 'XNAT Session Label',
                events: 'customMultipleUploadLabelChange',
                sortable: true,
                class: 'break-all highlight',
                formatter: function(value, row, index, field) {
                    return `<input required type="text" name="experiment_label--${row.patient_id}" value="${value}" 
                    class="label-field form-control form-control-sm" />`
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
    selected_sessions_table: selected_sessions_table,
    custom_upload_multiple_table: custom_upload_multiple_table
}