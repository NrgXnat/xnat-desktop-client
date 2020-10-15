const { PRIMARY_MODALITIES } = require('../services/constants')
const XNATAPI = require('../services/xnat-api')

class ExperimentLabel {
    constructor(_project_id, _subject_id, _visit_id, _selected_modality, _subtype, _session_date, _selected_series, _pet_tracer, _custom_pet_tracer, _subject_label) {
        this.project_id = _project_id
        this.subject_id = _subject_id
        this.visit_id = _visit_id
        this.selected_modality = _selected_modality
        this.subtype = _subtype
        this.session_date = _session_date
        this.selected_series = _selected_series
        this.pet_tracer = _pet_tracer
        this.custom_pet_tracer = _custom_pet_tracer
        this.subject_label = _subject_label

        this.init()
    }

    init() {
        this.series_modalities_index = this.getModalitiesIndex()
        this.series_modalities = Object.keys(this.series_modalities_map);
        this.series_modalities_label = this.series_modalities.join('');

        this.validateModalities()
        this.modality = this.getModalityString()

    }

    async generateLabel() {
        try {
            const xnat_api = new XNATAPI(xnat_server, user_auth)
            const expt_label = await xnat_api.project_experiment_label(this.project_id, this.subject_id, this.visit_id, this.subtype, this.session_date, this.series_modalities_label)
    
            if (!expt_label) {
                default_set_experiment_label();
            } else {
                update_experiment_label(expt_label);
            }
            
        } catch (err) {
            if (err.response && err.response.status === 400) {
                default_set_experiment_label();
    
                if (show_unable_to_set_session_label_warning === 0) {
                    show_unable_to_set_session_label_warning++
                    swal({
                        title: `Warning: unable to set session label per project protocol labeling template`,
                        text: 'Unable to set session label per protocol template: ' + err.response.data + '. Reverting to default labeling.',
                        icon: "warning",
                        button: 'OK',
                        dangerMode: true
                    })
                }
                
            } else {
                default_set_experiment_label();
            }
        }
    }

    generateLabel() {
        let expt_label = this.subject_label.split(' ').join('_') + '_' + this.modality + '_'

        for (let i = 1; i < 100000; i++) {
            let my_expt_label = expt_label + i
            if (this.existing_experiment_labels.indexOf(my_expt_label) === -1) {
                expt_label = my_expt_label
                break
            }
        }

        return expt_label
    }

    validateModalities() {
        if (this.selected_modality && this.selected_modality != this.series_modalities_label && this.selected_series.length) {
            this.triggerError('ModalityMismathch')
        }
    }

    getModalitiesIndex() {
        return this.selected_series.reduce((allModalities, row) => {
            if (PRIMARY_MODALITIES.indexOf(row.modality) !== -1) {
                if (allModalities.hasOwnProperty(row.modality)) {
                    allModalities[row.modality]++;
                } else {
                    allModalities[row.modality] = 1;
                }
            }
            
            return allModalities;
        }, {});
    }

    getModalityString() {
        let modality;
        if (this.series_modalities.indexOf('PT') >= 0) {
            modality = this.pet_tracer === 'OTHER' ? this.custom_pet_tracer : this.pet_tracer;
        } else if (this.series_modalities.length == 1) {
            modality = this.series_modalities[0];
        } else {
            //remove OT from this.series_modalities_index
            delete this.series_modalities_index['OT'];
    
            // chose most frequent modality (with most series)
            let max_mod_freq = 0;
            for (let mod in this.series_modalities_index) {
                if (this.series_modalities_index[mod] > max_mod_freq) {
                    max_mod_freq = this.series_modalities_index[mod]
                    modality = mod
                }
            }
        }

        return modality;
    }

    triggerError(errorType) {
        throw new Error(errorType)
    }

}

module.exports = ExperimentLabel