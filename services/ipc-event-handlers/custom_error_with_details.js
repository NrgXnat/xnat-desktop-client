const swal = require('sweetalert');

let interval;
let queue = [];

module.exports = (e, title, subtitle, details) => {

    const el = ( domstring ) => {
        const html = new DOMParser().parseFromString( domstring , 'text/html');
        return html.body.firstChild;
    };

    let html = `<div class="error-details-outer">
        <p>
            <button class="btn btn-sm btn-gray" 
                type="button" data-toggle="collapse" data-target="#errorDetails" 
                aria-expanded="false" aria-controls="errorDetails">
                Details
            </button>
        </p>
        <div class="collapse" id="errorDetails">
            <small class="card card-body text-left">
                ${details}
            </small>
        </div>
    </div>
    `;

    queue.push(function() {
        swal({
            title: title,
            text: subtitle,
            content: el(html),
            icon: 'error',
            button: 'Okay',
            dangerMode: true
        })
    })
    
    if (interval) {
        clearInterval(interval)
    }

    interval = setInterval(function() {
        if (!swal.getState().isOpen) {
            if (queue.length === 0) {
                clearInterval(interval)
            } else {
                let current_swal = queue.shift()
                current_swal()
            }
        }
    }, 300)

    console.log('custom_error_with_details', {e, title, subtitle, details});
}
