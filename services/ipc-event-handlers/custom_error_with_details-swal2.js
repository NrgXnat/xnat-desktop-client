const Swal = require('sweetalert2');

module.exports = (e, title, subtitle, details) => {

    let html = `<div class="error-details-outer">
        <p>${subtitle}</p>
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

    //swal()

    const MySwal = Swal.mixin({
        icon: "error",

        confirmButtonColor: '#3085d6',
        confirmButtonText: 'Okay!',
        
        showCancelButton: false,
        cancelButtonText: 'No, cancel!',
        cancelButtonColor: '#ccc',

        reverseButtons: true,
        allowOutsideClick: false,
        allowEscapeKey: false,

        // timer: 7500,
        // timerProgressBar: true
    })

    

    if (!MySwal.isVisible()) {
        MySwal.queue([{
            title: title,
            html: html
        }])
        
    } else {
        MySwal.insertQueueStep({
            title: title,
            html: html
        })
    }
    

    console.log('custom_error_with_details', {e, title, subtitle, details});
}