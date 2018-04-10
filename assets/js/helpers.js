const settings = require('electron-settings');

let Helper = {
    blockModal: (modal_id) => {
        $(modal_id).find('.modal-content').block()
    },
    unblockModal: (modal_id) => {
        $(modal_id).find('.modal-content').unblock()
    },
    pageLoadTrigger: (page_id) => {
        console.log(document.readyState);
    
        switch (document.readyState) {
            case 'complete':
                $(page_id).trigger('page:load');
                break;
    
            default:
                // page:load on DOM-ready
                $(function(){
                    $(page_id).trigger('page:load');
                });
        }
    },
    UI: {
        userMenuHide: () => {
            $('.hidden-by-default').each(function(){
                $(this).addClass('hidden');
            })
        },
        userMenuShow: () =>  {
            let server_name = settings.get('xnat_server').split('//')[1];
            $("#menu--server").html(server_name);
            $("#menu--username").html(settings.get('user_auth').username);
            $('#menu--username-server').html(settings.get('user_auth').username + '@' + server_name);
            
            $('.hidden-by-default').each(function(){
                $(this).removeClass('hidden');
            })
        }
    }
}

module.exports = Helper;