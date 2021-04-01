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

function findSOPClassUID(SOPClassUID) {
    const SOPClassUIDs = [
        {"SOPClassUID":"1.2.840.10008.1.1","label":"Verification SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.1.20.1","label":"Storage Commitment Push Model SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.1.20.2","label":"Storage Commitment Pull Model SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.1.3.10","label":"Media Storage Directory Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.1.40","label":"Procedural Event Logging SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.1.9","label":"Basic Study Content Notification SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.1.1","label":"Detached Patient Management SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.1.4","label":"Detached Patient Management  Meta SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.2.1","label":"Detached Visit Management SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.3.1","label":"Detached Study Management SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.3.2","label":"Study Componenet Management SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.3.3","label":"Modality Performed Procedure Step SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.3.1.2.3.4","label":"Modality Performed Procedure Step Retrieve  SOP  Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.3.1.2.3.5","label":"Modality Performed Procedure Step Notification  SOP  Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.3.1.2.5.1","label":"Detached Results  Management   SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.5.4","label":"Detached Results  Management Meta   SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.5.5","label":"Detached Study  Management   Meta SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.3.1.2.6.1","label":"Detached Interpretation  Management   SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.4.2","label":"Storage Service Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.1","label":"Basic Film Session SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.14","label":"Print Job SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.15","label":"Basic Annotation Box SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.16","label":"Printer SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.16.376","label":"Printer  Configuration Retrieval SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.18","label":"Basic Color Print Management Meta SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.18.1","label":"Referenced Color Print Management Meta SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.2","label":"Basic Film Box SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.22","label":"VOI LUT Box SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.23","label":"Presentation LUT SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.24","label":"Image Overlay Box SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.24.1","label":"Basic Print Image Overlay Box SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.26","label":"Print Queue Management SOP Classs","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.27","label":"Stored Print Storage SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.29","label":"Hardcopy Grayscale Image Storage SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.30","label":"Hardcopy Color Image Storage SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.31","label":"Pull Print Request SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.32","label":"Pull Stored Print Management Meta SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.33","label":"Media Creation Management SOP Class UID","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.4","label":"Basic Grayscale Image Box SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.4.1","label":"Basic Color Image Box SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.4.2","label":"Referenced Image Box SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.1.9","label":"Basic Grayscale Print Management Meta SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.1.9.1","label":"Referenced Grayscale Print Management Meta SOP Class","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.1","label":"CR Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.1.1","label":"Digital X-Ray Image Storage – for Presentation","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.1.1.1","label":"Digital X-Ray Image Storage – for Processing","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.1.2","label":"Digital Mammography X-Ray Image Storage – for Presentation","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.1.2.1","label":"Digital Mammography X-Ray Image Storage – for Processing","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.1.3","label":"Digital Intra – oral X-Ray Image Storage – for Presentation","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.1.3.1","label":"Digital Intra – oral X-Ray Image Storage – for Processing","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.10","label":"Standalone Modality LUT Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.104.1","label":"Encapsulated PDF Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.11","label":"Standalone VOI LUT Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.11.1","label":"Grayscale Softcopy Presentation State Storage SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.11.2","label":"Color Softcopy Presentation State Storage SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.11.3","label":"Pseudocolor Softcopy Presentation Stage Storage SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.11.4","label":"Blending Softcopy Presentation State Storage SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.12.1","label":"X-Ray Angiographic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.12.1.1","label":"Enhanced XA Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.12.2","label":"X-Ray Radiofluoroscopic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.12.2.1","label":"Enhanced XRF Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.12.3","label":"X-Ray Angiographic Bi-plane Image Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.128","label":"Positron Emission Tomography Curve Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.129","label":"Standalone Positron Emission Tomography Curve Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.2","label":"CT Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.2.1","label":"Enhanced CT Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.20","label":"NM Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.3","label":"Ultrasound Multiframe Image Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.3.1","label":"Ultrasound Multiframe Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.4","label":"MR Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.4.1","label":"Enhanced MR Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.4.2","label":"MR Spectroscopy Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.1","label":"Radiation Therapy Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.2","label":"Radiation Therapy Dose Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.3","label":"Radiation Therapy Structure Set Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.4","label":"Radiation Therapy Beams Treatment Record Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.5","label":"Radiation Therapy Plan Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.6","label":"Radiation Therapy Brachy Treatment Record Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.7","label":"Radiation Therapy Treatment Summary Record Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.8","label":"Radiation Therapy Ion Plan Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.481.9","label":"Radiation Therapy Ion Beams Treatment Record Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.5","label":"NM Image Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.6","label":"Ultrasound Image Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.6.1","label":"Ultrasound Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.66","label":"Raw Data Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.66.1","label":"Spatial Registration Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.66.2","label":"Spatial Fiducials Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.66.3","label":"Deformable Spatial Registration Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.66.4","label":"Segmentation Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.67","label":"Real World Value Mapping Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.7","label":"Secondary Capture Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.7.1","label":"Multiframe Single Bit Secondary Capture Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.7.2","label":"Multiframe Grayscale Byte Secondary Capture Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.7.3","label":"Multiframe Grayscale Word Secondary Capture Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.7.4","label":"Multiframe True Color Secondary Capture Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1","label":"VL (Visible Light) Image Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.1","label":"VL endoscopic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.1.1","label":"Video Endoscopic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.2","label":"VL Microscopic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.2.1","label":"Video Microscopic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.3","label":"VL Slide-Coordinates Microscopic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.4","label":"VL Photographic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.4.1","label":"Video Photographic Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.5.1","label":"Ophthalmic Photography 8-Bit Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.5.2","label":"Ophthalmic Photography 16-Bit Image Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.1.5.3","label":"Stereometric Relationship Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.77.2","label":"VL Multiframe Image Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.8","label":"Standalone Overlay Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.88.11","label":"Basic Text SR","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.88.22","label":"Enhanced SR","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.88.33","label":"Comprehensive SR","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.88.40","label":"Procedure Log Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.88.50","label":"Mammography CAD SR","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.88.59","label":"Key Object Selection Document","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.88.65","label":"Chest CAD SR","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.88.67","label":"X-Ray Radiation Dose SR","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.9","label":"Standalone Curve Storage","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.9.1.1","label":"12-lead ECG Waveform Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.9.1.2","label":"General ECG Waveform Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.9.1.3","label":"Ambulatory ECG Waveform Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.9.2.1","label":"Hemodynamic Waveform Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.9.3.1","label":"Cardiac Electrophysiology Waveform Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.1.9.4.1","label":"Basic Voice Audio Waveform Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.1.1","label":"Patient Root Query/Retrieve Information Model – FIND","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.1.2","label":"Patient Root Query/Retrieve Information Model – MOVE","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.1.3","label":"Patient Root Query/Retrieve Information Model – GET","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.2.1","label":"Study Root Query/Retrieve Information Model – FIND","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.2.2","label":"Study Root Query/Retrieve Information Model – MOVE","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.2.3","label":"Study Root Query/Retrieve Information Model – GET","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.3.1","label":"Patient/Study Only Query/Retrieve Information Model – FIND","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.3.2","label":"Patient/Study Only Query/Retrieve Information Model – MOVE","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.1.2.3.3","label":"Patient/Study Only Query/Retrieve Information Model – GET","retired":true},
        {"SOPClassUID":"1.2.840.10008.5.1.4.31","label":"Modality Worklist Information Model – FIND","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.32","label":"General Purpose Worklist Management Meta SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.32.1","label":"General Purpose Worklist Information Model – FIND","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.32.2","label":"General Purpose Scheduled Procedure Step SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.32.3","label":"General Purpose Performed Procedure Step SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.33","label":"Instance Availability Notification SOP Class","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.37.1","label":"General Relevant Patient Information Query","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.37.2","label":"Breast Imaging Relevant Patient Information Query","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.37.3","label":"Cardiac Relevant Patient Information Query","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.38.1","label":"Hanging Protocol Storage","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.38.2","label":"Hanging Protocol Information Model – FIND","retired":false},
        {"SOPClassUID":"1.2.840.10008.5.1.4.38.3","label":"Hanging Protocol Information Model – MOVE","retired":false}
    ]

    const item = SOPClassUIDs.find(item => {
        return item["SOPClassUID"] === SOPClassUID
    })

    return item ? item : {label: 'N/A'}
}

function findTransferSyntaxUID(TransferSyntaxUID) {
    const TransferSyntaxUIDs = [
        {"TransferSyntaxUID":"1.2.840.10008.1.2","label":"Implicit VR Endian: Default Transfer Syntax for DICOM","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.1","label":"Explicit VR Little Endian","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.1.99","label":"Deflated Explicit VR Little Endian","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.2","label":"Explicit VR Big Endian","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.50","label":"JPEG Baseline (Process 1):Default Transfer Syntax for Lossy JPEG 8-bit Image Compression","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.51","label":"JPEG Baseline (Processes 2 & 4):Default Transfer Syntax for Lossy JPEG 12-bit Image Compression(Process 4 only)","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.52","label":"JPEG Extended (Processes 3 & 5)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.53","label":"JPEG Spectral Selection, Nonhierarchical (Processes 6 & 8)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.54","label":"JPEG Spectral Selection,  Nonhierarchical (Processes 7 & 9)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.55","label":"JPEG Full Progression, Nonhierarchical (Processes 10 & 12)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.56","label":"JPEG Full Progression, Nonhierarchical (Processes 11 & 13)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.57","label":"JPEG Lossless, Nonhierarchical (Processes 14)","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.58","label":"JPEG Lossless, Nonhierarchical (Processes 15)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.59","label":"JPEG Extended, Hierarchical (Processes 16  & 18)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.60","label":"JPEG Extended, Hierarchical (Processes 17  & 19)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.61","label":"JPEG Spectral Selection, Hierarchical (Processes 20 & 22)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.62","label":"JPEG Spectral Selection, Hierarchical (Processes 21 & 23)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.63","label":"JPEG Full Progression,  Hierarchical (Processes 24 & 26)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.64","label":"JPEG Full Progression,  Hierarchical (Processes 25 & 27)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.65","label":"JPEG Lossless, Nonhierarchical (Process  28)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.66","label":"JPEG Lossless, Nonhierarchical (Process  29)","retired":true},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.70","label":"JPEG Lossless, Nonhierarchical, First- Order Prediction(Processes 14 [Selection Value 1]): Default Transfer Syntax for Lossless JPEG Image Compression","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.80","label":"JPEG-LS  Lossless  Image Compression","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.81","label":"JPEG-LS  Lossy (Near- Lossless)  Image Compression","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.90","label":"JPEG 2000 Image Compression (Lossless Only)","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.91","label":"JPEG 2000 Image Compression","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.92","label":"JPEG 2000 Part 2 Multicomponent Image Compression (Lossless Only)","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.93","label":"JPEG 2000 Part 2 Multicomponent Image Compression","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.94","label":"JPIP Referenced","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.95","label":"JPIP Referenced Deflate","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.5","label":"RLE Lossless","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.6.1","label":"RFC 2557 MIME Encapsulation","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.100","label":"MPEG2 Main Profile Main Level","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.102","label":"MPEG-4 AVC/H.264 High Profile / Level 4.1","retired":false},
        {"TransferSyntaxUID":"1.2.840.10008.1.2.4.103","label":"MPEG-4 AVC/H.264 BD-compatible High Profile / Level 4.1","retired":false}
    ]

    const item = TransferSyntaxUIDs.find(item => {
        return item["TransferSyntaxUID"] === TransferSyntaxUID
    })

    return item ? item : {label: 'N/A'}
}

module.exports = {
    selected_sessions_table: selected_sessions_table,
    custom_upload_multiple_table: custom_upload_multiple_table,
    selected_scans_table: selected_scans_table
}