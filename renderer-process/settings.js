//require('promise.prototype.finally').shim();
const path = require('path');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer
const swal = require('sweetalert');

const remote = require('electron').remote;

const app = require('electron').remote.app

const auth = require('../services/auth');

//const blockUI = require('blockui-npm');
let allow_insecure_ssl;

$(document).on('page:load', '#settings-section', function(e){
    console.log('Ucitano................')
    
    render_users();
    show_default_email_address();
    show_default_local_storage();  

});


function show_default_email_address() {
    $('#default_email_address').val(settings.get('default_email_address'));
}


function show_default_local_storage() {
    $('#default_local_storage').val(settings.get('default_local_storage'));
}


function render_users() {
    let logins = settings.get('logins');

    let table_rows = [];

    logins.forEach(function(el, i){
        table_rows.push({
            server: el.server,
            user: el.username,
            action: ''
        });
    });

    let bt_options = $('#user_table').bootstrapTable('getOptions');

    if ($.isPlainObject(bt_options)) { // bootstrap table already initialized
        $('#user_table').bootstrapTable('destroy')
    }

    $('#user_table').bootstrapTable({
        filterControl: table_rows.length > 4 ? true : false,
        height: table_rows.length > 4 ? 242 : 0,
        columns: [
            {
                field: 'server',
                title: 'Server',
                sortable: true,
                filterControl: 'input',
                formatter: function(value, row, index, field) {
                    var server_name = value.split('//');
                    return server_name[1];
                }
            }, 
            {
                field: 'user',
                title: 'User',
                sortable: true,
                filterControl: 'input'
            }, 
            {
                field: 'action',
                title: 'Actions',
                class: 'action',
                formatter: function(value, row, index, field) {
                    return `
                    <a href="#" 
                        class="edit"
                        data-username="${row.user}" data-server="${row.server}"
                        data-toggle="modal" data-target="#user_connection"
                        ><i class="fas fa-edit"></i></a>
                
                    <a href="#" 
                        class="trash js_remove_login"
                        data-username="${row.user}" data-server="${row.server}"
                        ><i class="fas fa-trash-alt"></i></a>
                    `;
                }
            }
        ],
        data: table_rows
    });
    
}


function test_login(xnat_server, user_auth, old_user_data) {
    console.log(xnat_server, user_auth, old_user_data);

    if (xnat_server.indexOf('http://') === 0 || xnat_server.indexOf('https://') === 0) {
        login_attempt(xnat_server, user_auth, old_user_data);
    } else {
        let server_with_protocol = 'https://' + xnat_server;
        
        auth.login_promise(server_with_protocol, user_auth)
            .then(res => {
                handleLoginSuccess(server_with_protocol, user_auth, old_user_data);
            })
            .catch(err => {
                server_with_protocol = 'http://' + xnat_server;
                login_attempt(server_with_protocol, user_auth, old_user_data);
            });
    }
    
}

function handleLoginSuccess(xnat_server, user_auth, old_user_data) {
    auth.save_login_data(xnat_server, user_auth, allow_insecure_ssl, old_user_data);

    $('#user_connection').modal('hide')
    render_users();

    Helper.pnotify('Success!', `User connection is ${old_user_data.username ? 'updated': 'added'}.`);

    // swal({
    //     title: "Success!",
    //     text: `User connection is ${old_user_data.username ? 'updated': 'added'}.`,
    //     icon: "success",
    //     button: "Okay",
    // });
}

function login_attempt(xnat_server, user_auth, old_user_data) {
    auth.login_promise(xnat_server, user_auth)
        .then(res => {
            handleLoginSuccess(xnat_server, user_auth, old_user_data);
        })
        .catch(error => {
            let msg = `
                User credentials were not saved!<br>
                XNAT server: ${xnat_server}<br>
                Username: ${user_auth.username}<br><br>
                ${Helper.errorMessage(error)}
            `;

            $('#login_feedback').removeClass('hidden');
            $('#login_error_message').html(msg);
        })
        .finally(() => {
            Helper.unblockModal('#user_connection');
            $('#password').val('').focus();

            app.allow_insecure_ssl = false;
        });
}


$(document).on('input', '#default_email_address', function(e) {
    $('#save_default_email_address').prop('disabled', false);
});

$(document).on('click', '#save_default_email_address', function(e) {
    e.preventDefault();

    if ($('#default_email_address').is(':invalid')) {
        swal({
            title: "Error!",
            text: "Please validate email field",
            icon: "error",
            button: "Okay",
          });
    } else {
        settings.set('default_email_address', $('#default_email_address').val());

        Helper.pnotify('Success!', `Default email address successfully updated! (${$('#default_email_address').val()})`);
        
        $(this).prop('disabled', true);
    }
    
});

$(document).on('change', '#file_default_local_storage', function(e) {
    settings.set('default_local_storage', this.files[0].path);
    $('#default_local_storage').val(this.files[0].path);

    Helper.pnotify('Success!', `Default local storage path successfully updated! (${this.files[0].path})`);
    // swal({
    //     title: "Success!",
    //     text: "Default local storage path successfully updated!",
    //     icon: "success",
    //     button: "Okay"
    // });
});

$(document).on('submit', '#userForm', function(e) {
    Helper.blockModal('#user_connection');

    e.preventDefault();
    $('#login_feedback').addClass('hidden')

    let xnat_server = $('#server').val().replace(/\/$/, '');
    let user_auth = {
        username: $('#username').val(),
        password: $('#password').val()
    }
    let old_user_data = {
        server: $('#old_server').val(),
        username: $('#old_username').val()
    }
    allow_insecure_ssl = $('#allow_insecure_ssl').is(':checked');
    app.allow_insecure_ssl = allow_insecure_ssl;

    test_login(xnat_server, user_auth, old_user_data)
});

$(document).on('show.bs.modal', '#user_connection', function(e) {
    //get data-id attribute of the clicked element
    var username = $(e.relatedTarget).data('username');
    $(e.currentTarget).find('input[name="username"]').val(username);
    
    var server = $(e.relatedTarget).data('server');
    $(e.currentTarget).find('input[name="server"]').val(server);

    let focused_field = server && username ? '#password' : '#server';
    setTimeout(function(){
        $(focused_field).focus();
    }, 500);

    if (typeof username == 'undefined') {
        $('#remove_login').hide();
    } else {
        $('#old_server').val(server);
        $('#old_username').val(username);

        $('#remove_login').show();
    }
});

$(document).on('click', '.js_remove_login', function(e){
    let $this = $(this);
    swal({
        title: "Remove stored connection?",
        text: `Are you sure you want to remove it from the list?
            
            Server: ${$this.data('server')}
            Username: ${$this.data('username')}
        `,
        icon: "warning",
        buttons: [true, 'Remove'],
        closeOnEsc: false,
        dangerMode: true
    })
    .then((doRemove) => {
        if (doRemove) {
            let xnat_server = $this.data('server');
            let user_auth = {
                username: $this.data('username')
            }

            auth.remove_login_data(xnat_server, user_auth)

            render_users();

            Helper.pnotify('Connection data removed!', 'Connection data removed from the list of stored connections.');

            // swal({
            //     title: "Connection data removed",
            //     text: "Connection data removed from the list of stored connections",
            //     icon: "success",
            //     closeOnEsc: false
            // })
        }
    });
});
