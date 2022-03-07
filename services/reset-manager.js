class ResetManager {
    
    constructor() {
        this.queue = []
    }

    clear() {
        this.queue = []
    }
    
    add(label, callback) {
        this.queue.push({label, callback});
    }
    
    remove(...labels) {
        this.queue = this.queue.filter(item => !labels.includes(item.label))
    }
    
    execSingle(label) {
        const selected_reset = this.queue.find(item => item.label === label)

        console.log(`>>>>>>>>>> RESET - ${selected_reset.label}`);
        

        selected_reset.callback()
    }

    execAfter(label) {
        const label_index = this.index(label)

        if (label_index !== -1) {
            const resets = this.queue.slice(label_index + 1)
            resets.forEach(item => this.execSingle(item.label))
            //resets.forEach(item => item.callback())
        }
    }

    execFrom(label) {
        const label_index = this.index(label)

        if (label_index !== -1) {
            const resets = this.queue.slice(label_index)
            resets.forEach(item => this.execSingle(item.label))
            //resets.forEach(item => item.callback())
        }
    }

    execAll() {
        this.queue.forEach(item => this.execSingle(item.label))
        //this.queue.forEach(item => item.callback())
    }

    index(label) {
        return this.queue.findIndex(item => item.label === label)
    }

    labels() {
        return this.queue.map(item => item.label)
    }
    
}

module.exports = ResetManager