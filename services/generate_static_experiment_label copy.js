const { PRIMARY_MODALITIES } = require('../services/constants')

class ExperimentLabel {
    constructor(data, _existing_experiment_labels) {
        for (let prop in data) {
            this[prop] = data[prop]
        }
        this.validate()

        this.existing_experiment_labels = _existing_experiment_labels

        this.computeProperties()
    }

    validate() {
        if (!this.hasOwnProperty('subject_label')) {
            this.triggerError('ParamError:subject_label')
        } else if (!this.hasOwnProperty('selected_series')) {
            this.triggerError('ParamError:selected_series')
        } else if (this.selected_series.length === 0) {
            this.triggerError('ParamError:selected_series.length')
        } else if (!this._validateRowModality()) {
            this.triggerError('ParamError:invalidRowModality')
        } else if (!this._validatePetTracers()) {
            this.triggerError('ParamError:invalidPetTracers')
        }
    }

    // validate that all selected scans have 'modality' property
    _validateRowModality() {
        return this.selected_series.reduce((current, item) => current && item.hasOwnProperty('modality'), true)
    }

    _validatePetTracers() {
        const modalities = this.selected_series.map(row => row.modality)

        if (modalities.includes('PT')) {
            if (!this.hasOwnProperty('pet_tracer')) {
                return false
            } else if (!this.pet_tracer) {
                return false
            } else if (this.pet_tracer === 'OTHER') {
                if (!this.hasOwnProperty('custom_pet_tracer') || !this.custom_pet_tracer) {
                    return false
                } else {
                    return true
                }
            } else {
                return true
            }
        } else {
            return true
        }
        
    }

    triggerError(errorType) {
        throw new Error(errorType)
    }

    computeProperties() {
        this.series_modalities_index = this.getModalitiesIndex() // modality => count (object)
        this.series_modalities = Object.keys(this.series_modalities_index) // modality array

        this.modality = this.getModality()
    }

    getModalitiesIndex() {
        return this.selected_series.reduce((allModalities, row) => {
            if (PRIMARY_MODALITIES.includes(row.modality)) {
                if (allModalities.hasOwnProperty(row.modality)) {
                    allModalities[row.modality]++
                } else {
                    allModalities[row.modality] = 1
                }
            }
            
            return allModalities
        }, {})
    }

    getModality() {
        let modality;
        if (this.series_modalities.indexOf('PT') >= 0) {
            modality = this.pet_tracer === 'OTHER' ? this.custom_pet_tracer : this.pet_tracer
        } else if (this.series_modalities.length == 1) {
            modality = this.series_modalities[0]
        } else {
            //remove OT from this.series_modalities_index
            delete this.series_modalities_index['OT']
    
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

    generateLabel() {
        let expt_label = this.subject_label.split(' ').join('_') + '_' + this.modality + '_'

        for (let i = 1; i < 100000; i++) {
            let my_expt_label = expt_label + i
            if (!this.existing_experiment_labels.includes(my_expt_label)) {
                expt_label = my_expt_label
                break
            }
        }

        return expt_label
    }

}


function experiment_label() {
  const data = {
    subject_label: $("#var_subject").val(),
    selected_series: $("#image_session").bootstrapTable("getSelections"),
    pet_tracer: $("#pet_tracer").length ? $("#pet_tracer").val() : "",
    custom_pet_tracer: ("" + $("#custom_pet_tracer").val())
      .trim()
      .split(" ")
      .join("_")
  };

  let _existing_experiment_labels = ["MR", "CT"];
  let exp_label = new ExperimentLabel(data, _existing_experiment_labels);

  const experiment_label = exp_label.generateLabel()
}