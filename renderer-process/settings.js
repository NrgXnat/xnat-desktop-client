//require('promise.prototype.finally').shim();
const path = require('path');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer
const swal = require('sweetalert');

const remote = require('electron').remote;

const auth = require('../services/auth');

//const blockUI = require('blockui-npm');


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

    auth.login_promise(xnat_server, user_auth)
        .then(res => {
            auth.save_login_data(xnat_server, user_auth, old_user_data)

            $('#user_connection').modal('hide')

            render_users();
            //logout();

            swal({
                title: "Success!",
                text: `User connection is ${old_user_data.username ? 'updated': 'added'}.`,
                icon: "success",
                button: "Okay",
            });

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
        });
}


function logout() {
    let xnat_server = settings.get('xnat_server');
    
    auth.logout_promise(xnat_server)
        .then(res => {
            settings.delete('user_auth')
            settings.delete('xnat_server')

            console.log('Logout: ', res);

            Helper.UI.userMenuHide();
        })
        .catch(err => {
            console.log(err)
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
        swal({
            title: "Success!",
            text: "Default email address successfully updated!",
            icon: "success",
            button: "Okay",
        });
        $(this).prop('disabled', true);
    }
    
});

$(document).on('change', '#file_default_local_storage', function(e) {
    settings.set('default_local_storage', this.files[0].path);
    $('#default_local_storage').val(this.files[0].path);

    swal({
        title: "Success!",
        text: "Default local storage path successfully updated!",
        icon: "success",
        button: "Okay"
    });
});

$(document).on('submit', '#userForm', function(e) {
    Helper.blockModal('#user_connection');

    e.preventDefault();
    $('#login_feedback').addClass('hidden')

    let xnat_server = $('#server').val();
    let user_auth = {
        username: $('#username').val(),
        password: $('#password').val()
    }
    let old_user_data = {
        server: $('#old_server').val(),
        username: $('#old_username').val()
    }

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

            swal({
                title: "Connection data removed",
                text: "Connection data removed from the list of stored connections",
                icon: "success",
                closeOnEsc: false
            })
        }
    });
});
