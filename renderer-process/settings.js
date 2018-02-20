const axios = require('axios');
const path = require('path');
const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer
const swal = require('sweetalert');


$(document).on('page:load', '#settings-section', function(e){
    console.log('Ucitano................')
    render_users()
    show_default_email_address()
    show_default_local_storage()
});

function show_default_email_address() {
    $('#default_email_address').val(settings.get('default_email_address'));
}


function show_default_local_storage() {
    $('#default_local_storage').val(settings.get('default_local_storage'));
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
})


function render_users() {
    let logins = settings.get('logins');

    if (logins.length) {
        $('#user_table > tbody').html('');

        logins.forEach(append_user_row);
    }
}

function append_user_row(el) {
    var server_name = el.server.split('//');
    
    $('#user_table > tbody').append(`
        <tr>
            <td>${server_name[1]}</td>
            <td>${el.username}</td>
            <td class="action">
                <a href="#" 
                    class="edit"
                    data-username="${el.username}" data-server="${el.server}"
                    data-toggle="modal" data-target="#user_connection"
                    ><i class="fas fa-edit"></i></a>
                
                <a href="#" 
                    class="trash js_remove_login"
                    data-username="${el.username}" data-server="${el.server}"
                    ><i class="fas fa-trash-alt"></i></a>
            </td>
        </tr>

    `);
}

$(document).on('submit', '#userForm', function(e) {
    e.preventDefault();
    $('#login_feedback').addClass('hidden')

    xnat_server = $('#server').val();
    user_auth = {
        username: $('#username').val(),
        password: $('#password').val()
    }
    old_user_data = {
        server: $('#old_server').val(),
        username: $('#old_username').val()
    }

    test_login(xnat_server, user_auth, old_user_data)
})


function test_login(xnat_server, user_auth, old_user_data) {
    console.log(xnat_server, user_auth);

    axios.get(xnat_server + '/data/auth', {
        auth: user_auth
    })
    .then(res => {
        settings.set('xnat_server', xnat_server);
        settings.set('user_auth', user_auth);

        let logins = settings.get('logins');


        // REMOVE OLD
        let found_old = -1;
        logins.forEach(function(el, i) {
            if (el.server === old_user_data.server && el.username === old_user_data.username) {
                found_old = i;
            }
        })

        if (found_old != -1) {
            logins.splice(found_old, 1)
        }



        // DEAL WITH NEW
        let found = -1;
        logins.forEach(function(el, i) {
            if (el.server === xnat_server && el.username === user_auth.username) {
                found = i;
            }
        })
        
        if (found == -1) { // not found
            logins.unshift({
                server: xnat_server,
                username: user_auth.username
            });
        } else if (found == 0) { // found first
            // do nothing
        } else { // found not first
            logins.splice(found, 1)
            logins.unshift({
                server: xnat_server,
                username: user_auth.username
            });
        }

        // SAVE
        settings.set('logins', logins);



        $('#password').val('')
        $('#user_connection').modal('hide')
        
        $("#header_menu .hidden").each(function(){
            $(this).removeClass('hidden');
        })
        $("#menu--server").html(xnat_server);
        $("#menu--username").html(user_auth.username);
        $('#menu--username-server').html(user_auth.username + '@' + xnat_server);


        render_users();
        logout();

        swal({
            title: "Success!",
            text: "User connection is updated.",
            icon: "success",
            button: "Okay",
        });

    })
    .catch(error => {
        let msg;

        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            //console.log(error.response.status);
            //console.log(error.response.data);
            //console.log(error.response.headers);
            switch(error.response.status) {
                case 401:
                    msg = 'Invalid username or password!';
                    break;
                case 404:
                    msg = 'Invalid XNAT server address';
                    break;
                default:
                    msg = 'An error occured. Please try again.'
            }
            
          } else if (error.request) {
            // The request was made but no response was received
            // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
            // http.ClientRequest in node.js
            console.log(error.request);
            msg = 'Please check XNAT server address (and your internet connection).'
          } else {
            // Something happened in setting up the request that triggered an Error
            console.log('Error', error.message);
            msg = error.message;
          }
          //console.log(error.config);

          msg = 'User credentials were not saved!<br>' + msg;

          $('#login_feedback').removeClass('hidden');
          $('#login_error_message').html(msg);
    });
}


function logout() {
    let xnat_server = settings.get('xnat_server');

    axios.get(xnat_server + '/app/action/LogoutUser')
    .then(res => {
        settings.delete('user_auth')
        settings.delete('xnat_server')

        console.log('Logout: ', res);

        $('.hidden-by-default').each(function(){
            $(this).addClass('hidden');
        })

    })
    .catch(err => {
        console.log(err)
    });
}


$(document).on('show.bs.modal', '#user_connection', function(e) {
    console.log(e)
    //get data-id attribute of the clicked element
    var username = $(e.relatedTarget).data('username');
    $(e.currentTarget).find('input[name="username"]').val(username);

    
    var server = $(e.relatedTarget).data('server');
    $(e.currentTarget).find('input[name="server"]').val(server);

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
            console.log('--------', xnat_server, user_auth)

            let logins = settings.get('logins');
            
            let found = -1;
            logins.forEach(function(el, i) {
                if (el.server === xnat_server && el.username === user_auth.username) {
                    found = i;
                }
            })

            console.log('FOUND: ' + found);
    
            if (found >= 0) { // not found
                logins.splice(found, 1)
            }

            settings.set('logins', logins);


            swal({
                title: "Connection data removed",
                text: "Connection data removed from the list of stored connections",
                icon: "success",
                closeOnEsc: false
            })
            .then((ok) => {
                $this.closest('tr').remove();
            });
        }
    });
});


function mile_voli_disko(str) {
    console.log('------' + str + ' voli disko-------')
}


function mile_voli_kolo(str) {
    console.log('------' + str + ' voli kolo-------')
}

module.exports = {mile_voli_disko, mile_voli_kolo};