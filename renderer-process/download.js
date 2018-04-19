const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');
const getSize = require('get-folder-size');
const axios = require('axios');
require('promise.prototype.finally').shim();
const settings = require('electron-settings');
const ipc = require('electron').ipcRenderer;
const swal = require('sweetalert');
const archiver = require('archiver');
const mime = require('mime-types');

const NProgress = require('nprogress');
NProgress.configure({ 
    trickle: false,
    easing: 'ease',
    speed: 1,
    minimum: 0.03
});



let xnat_server, user_auth;


function _init_img_sessions_table() {
    $('#image_session').bootstrapTable({
        height: 300,
        columns: [
            {
                field: 'select',
                title: 'Upload',
                checkbox: true
            }, 
            {
                field: 'description',
                title: 'Series Description',
                sortable: true
            }, 
            {
                field: 'count',
                title: 'File Count',
                sortable: true,
                align: 'right',
                class: 'right-aligned'
            }, 
            {
                field: 'size',
                title: 'Size (bytes)',
                sortable: true,
                align: 'right',
                class: 'right-aligned',
                formatter: function(value, row, index, field) {
                    return `${(value / 1024 / 1024).toFixed(2)} MB`;
                }
            }, 
            {
                field: 'series_id',
                title: 'Series ID',
                visible: false
            }
        ],
        data: [{
            select: false,
            description: 'Some text',
            count: 12,
            size: 1526257,
            series_id: '12345678'
        }]
    });
}

function _UI() {
    let server_name = xnat_server.split('//')[1];
    $('#server_name_tlbr').text(`[${server_name}]`);
}


function _init_variables() {
    xnat_server = settings.get('xnat_server');
    user_auth = settings.get('user_auth');

    _UI();
}

function resetSubsequentTabs() {

}

function promise_projects() {
    return axios.get(xnat_server + '/data/projects?permissions=edit&dataType=xnat:subjectData', {
    //return axios.get(xnat_server + '/data/projects?accessible=true', {
        auth: user_auth
    });
}



if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    ipc.send('redirect', 'login.html');
    return;
}




$(document).on('page:load', '#download-section', function(e){
    console.log('DOWNLOAD page:load triggered');
    
    _init_variables();
    resetSubsequentTabs();
    

    promise_projects()
        .then(function(resp) {
            let totalRecords = resp.data.ResultSet.Result.length;
            let projects = (totalRecords === 1) ? [resp.data.ResultSet.Result[0]] : resp.data.ResultSet.Result;


            $('#upload-project').html('');
            for (let i = 0, len = projects.length; i < len; i++) {
                console.log('---', projects[i].id)
                $('#upload-project').append(`
                    <li><a href="javascript:void(0)" data-project_id="${projects[i].id}">${projects[i].secondary_id} [ID:${projects[i].id}]</a></li>
                `)
            }

        })
        .catch(function(err) {
            console.log(err.message);
        })
    

    $('#upload_session_date')
        .attr('min', '1990-01-01')
        .attr('max', new Date().toISOString().split('T')[0])

        
});

$(document).on('click', '#download-section .js_next:not(.disabled)', function() {
    let active_tab_index = $('.nav-item').index($('.nav-item.active'));
    $('.nav-item').eq(active_tab_index + 1).removeClass('disabled').trigger('click');
    setTimeout(function() {
        $('.tab-pane.active .js_next').addClass('disabled');
    }, 100)
});

$(document).on('click', '#download-section .js_prev', function() {
    let active_tab_index = $('.nav-item').index($('.nav-item.active'));
    $('.nav-item').eq(active_tab_index - 1).trigger('click');
});

$(document).on('click', '#download-section a[data-project_id]', function(e){
    resetSubsequentTabs();
    $('#ui__project_name').hide()


    //$('.tab-pane.active .js_next').addClass('disabled');

    $(this).closest('ul').find('a').removeClass('selected');
    $(this).addClass('selected');
    let project_id = $(this).data('project_id')

    $('#ui__project_name').show().find('span').text(project_id);


});
