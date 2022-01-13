const ipcRenderer = require('electron').ipcRenderer;

const { findSOPClassUID } = require('../upload/sop_class_uids')
const { findTransferSyntaxUID } = require('../upload/transfer_syntax_uids')

const { alNumDashUnderscore } = require('../../services/app_utils')

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
        return total += (item.modality.includes('PT') ? 1 : 0)
    }, 0)

    window.customMultipleUploadTracerChange = {
        'input .tracer-field': function (e, value, row, index) {
            let new_value = alNumDashUnderscore(e.target.value)

            e.target.value = new_value
            row.tracer = new_value

            ipcRenderer.send('custom_upload_multiple:generate_exp_label', row)
        }
    }

    window.customMultipleUploadSubjectChange = {
        'input .subject-field': function (e, old_value, row, index) {
            let new_value = alNumDashUnderscore(e.target.value)

            e.target.value = new_value
            row.xnat_subject_id = new_value

            if ($('#session_labeling_pattern').val() === 'auto') {
                ipcRenderer.send('custom_upload_multiple:generate_exp_label', row)
            }

            $('#subject_labeling_pattern').val('manual')
        }
    }

    window.customMultipleUploadLabelChange = {
        'input .label-field': function (e, value, row, index) {
            let new_value = alNumDashUnderscore(e.target.value)

            e.target.value = new_value
            row.experiment_label = new_value

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
                title: 'XNAT Subject ID',
                events: 'customMultipleUploadSubjectChange',
                sortable: true,
                class: 'break-all highlight',
                formatter: function(value, row, index, field) {
                    const required = row.enabled ? 'required' : ''
                    return `<input ${required} type="text" 
                        name="xnat_subject_id--${row.patient_id}" value="${value}" 
                        class="subject-field form-control form-control-sm" />`
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
                    const required = row.enabled ? 'required' : ''
                    return row.modality.includes('PT') ? 
                        `<input ${required} type="text" name="tracer--${row.patient_id}" size="4" 
                        value="${field_val}" class="tracer-field form-control form-control-sm" />` : 
                        '';
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
                    const required = row.enabled ? 'required' : ''
                    return `<input ${required} type="text" name="experiment_label--${row.patient_id}"
                    value="${value}" class="label-field form-control form-control-sm" />`
                }
            }
            
        ],
        data: tbl_data
    });

    console.log('custom_upload_multiple_table INIT');

    $tbl.bootstrapTable('resetView');

    console.log('custom_upload_multiple_table RESET VIEW');
}

function validate_custom_upload_multiple_details() {
    console.log('validate_custom_upload_multiple_details TRIGGERED');

    let required_input_error = false;

    let $required_inputs = $('#custom_upload_multiple_tbl input[type=text]')
    let $upload_overwrite = $('#custom_upload_multiple #upload_overwrite_method')

    // validate table fields
    $required_inputs.each(function(){
        const is_invalid = 
            this.required && 
            // $(this).closest('tr').hasClass('selected')
            $(this).val() !== undefined && 
            $(this).val() !== null && 
            $(this).val().trim() === ''

        $(this).toggleClass('is-invalid', is_invalid);

        if (is_invalid) {
            required_input_error = true;
        }
    });

    // validate overwriting option
    let invalid_overwrite = $upload_overwrite.val() === ''
    $upload_overwrite.toggleClass('is-invalid', invalid_overwrite);
    if (invalid_overwrite) {
        required_input_error = true;
    }

    // select at least one session
    if ($('#custom_upload_multiple_tbl input[name="btSelectItem"]:checked').length === 0) {
        required_input_error = true
    }

    $('#nav-verify .js_next, #nav-verify .js_upload')
        .toggleClass('disabled', required_input_error)
        .prop('disabled', required_input_error);

    return required_input_error;
}

function selected_scans_table($tbl, tbl_data) {
    const tbl_id = $tbl.attr('id');

    destroyBootstrapTable($tbl);

    const event_list = 'check.bs.table uncheck.bs.table check-all.bs.table uncheck-all.bs.table';
    $tbl.off(event_list).on(event_list, toggle_bulk_buttons)

    function toggle_bulk_buttons(ev) {
        console.log({ev});
        let selected = $tbl.bootstrapTable('getSelections');

        $('[data-action^=bulk-action]').prop('disabled', selected.length === 0)

        $('[data-action^=bulk-action]').each(function() {
            const suffix = selected.length ? ` (${selected.length})` : '';
            $(this).text($(this).data('text') + suffix)
        })
    }
    
    $tbl.bootstrapTable({
        //height: tbl_data.length > 8 ? 400 : 0,
        sortName: 'patient_name',
        classes: 'table-sm',
        theadClasses: 'thead-light',
        filterControl: true,
        showSearchClearButton: true,
        hideUnusedSelectOptions: false,
        maintainMetaData: true,
        uniqueId: 'id',
        multipleSelectRow: true,
        onSearch: function () {
            const $clearFilterButton = $(`button[data-clear-filter-control="#${tbl_id}"]`)
            const totalRows = $tbl.bootstrapTable('getData').length;

            let activeFilters = 0;
            $tbl.find('.filter-control :input').each(function(e) {
                if ($(this).val() !== '') {
                    activeFilters++
                }
            })

            $clearFilterButton
                .prop('disabled', activeFilters === 0)
                .parent().find('.displayed-items').text(`Rows: ${totalRows}/${tbl_data.length}`);
            
        },
        columns: [
            {
                field: 'id',
                title: 'seriesInstanceUid',
                visible: false
            },
            {
                field: 'state',
                checkbox: true,
                align: 'center',
                valign: 'middle'
            },
            {
                field: 'imgDataUrl',
                title: 'Image',
                sortable: false,
                align: 'center',
                formatter: function(value, row, index, field) {
                    return `<img src="${value}" alt="${row.thumbPath}" title="${row.thumbPath}">`
                }
            },
            {
                field: 'sessionId',
                title: 'sessionId',
                filterControl: 'select',
                sortable: true,
                visible: false,
                class: 'break-all',
                width: 180
            },
            {
                field: 'studyInstanceUid',
                title: 'StdUid',
                sortable: true,
                filterControl: 'select',
                filterDataCollector: (value, row) => row.studyId,
                formatter: function(value, row, index, field) {
                    return `<span title="${value}">${row.studyId}</span>`
                }
            },
            {
                field: 'studyDescription',
                title: 'Study Description',
                filterControl: 'input',
                sortable: true,
            },
            {
                field: 'modality',
                title: 'Modality',
                sortable: true,
                filterControl: 'select',
                align: 'center'
            },
            {
                field: 'patient_data',
                title: 'Patient Data',
                sortable: true,
                class: 'break-all',
                visible: false,
                formatter: function(value, row, index, field) {
                    return `${row.patientName}<br>${row.patientId}`
                }
            },

            {
                field: 'image_data',
                title: 'Image Data',
                sortable: true,
                filterControl: 'select',
                class: '',
                formatter: function(value, row, index, field) {
                    return `${row.Rows}/${row.Columns} ${row.PhotometricInterpretation}`
                }
            },

            {
                field: 'file_data',
                title: 'File Data',
                sortable: true,
                class: '',
                visible: false,
                formatter: function(value, row, index, field) {
                    return `f: ${row.filesCount} (${row.frames}fr)`
                }
            },

            {
                field: 'SOPClassUID',
                title: 'SOPClassUID',
                sortable: true,
                filterControl: 'select',
                filterDataCollector: (value) => findSOPClassUID(value).label,
                formatter: function(value, row, index, field) {
                    return `<span title="${value}">${findSOPClassUID(value).label}</span>`
                }
            },

            {
                field: 'TransferSyntaxUID',
                title: 'TransferSyntaxUID',
                sortable: true,
                width: 300,
                visible: false,
                filterControl: 'select',
                filterDataCollector: (value) => findTransferSyntaxUID(value).label,
                formatter: function(value, row, index, field) {
                    return `<span title="${value}">${findTransferSyntaxUID(value).label}</span>`
                }
            },
            {
                field: 'accession',
                title: 'Accession',
                filterControl: 'select',
                sortable: true
            },
            {
                field: 'series_data',
                title: 'Series Data',
                filterControl: 'input',
                sortable: true,
                formatter: function(value, row, index, field) {
                    return `<b>${row.seriesNumber}</b>: [${row.seriesDescription}]`
                }
            },

            {
                field: 'matchingMask',
                title: 'Mask',
                sortable: true,
                filterControl: 'select',
                filterDataCollector: (value) => value == false ? '-' : value.alias,
                class: 'highlight',
                align: 'center',
                formatter: function(value, row, index, field) {
                    return value === false ? '-' : `<span title="${value.rectangles.join("\n")}">${value.alias}</span>`

                    return Array.isArray(value) ? 
                        `<i class="fas fa-check" title="${value.join("\n")}"><span class="sr-only">Yes</span></i>` : 
                        '<span class="sr-only">No</span>'
                }
            },

            {
                field: 'status',
                title: 'Status',
                filterControl: 'select',
                filterDataCollector: (value) => value ? 'Done' : 'Pending',
                sortable: true,
                formatter: function(value, row, index, field) {
                    return value ? 'Done' : 'Pending'
                }
            },

            {
                field: 'actions',
                title: '',
                escape: false,
                formatter: function(value, row, index, field) {
                    let content

                    switch (row.matchingMask) {
                        case false:
                            content = `
                                <button class="btn btn-block btn-gray" 
                                    data-toggle="modal" 
                                    data-target="#review-series-images"
                                    data-id="${row.id}"
                                    ><i class="fas fa-binoculars"></i> Anonymize</button>
                                `;
                            break;
                    
                        default:
                            content = `
                                <button class="btn btn-block btn-success" 
                                    data-toggle="modal" 
                                    data-target="#review-series-images"
                                    data-id="${row.id}"
                                    ><i class="fas fa-binoculars"></i> Review</button>
                                `;

                            break;
                    }

                   
                    return content;
                }
            }

            /*
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
                field: 'scan_count',
                title: 'Scans',
                sortable: true,
                class: 'right-aligned'
            }
            */
            
        ],
        data: tbl_data
    });

    $tbl.bootstrapTable('resetView');

    toggle_bulk_buttons()
}


function destroyBootstrapTable($tbl) {
    if ($.isPlainObject($tbl.bootstrapTable('getOptions'))) { // bootstrap table already initialized
        $tbl.bootstrapTable('destroy');
    }
}


module.exports = {
    selected_sessions_table: selected_sessions_table,
    custom_upload_multiple_table: custom_upload_multiple_table,
    validate_custom_upload_multiple_details,
    selected_scans_table: selected_scans_table
}