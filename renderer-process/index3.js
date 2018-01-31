const settings = require('electron-settings')
const ipc = require('electron').ipcRenderer

const links = document.querySelectorAll('link[rel="import"]')

let active_page;
if (!settings.has('user_auth') || !settings.has('xnat_server')) {
    active_page = 'login.html'
} else {
    active_page = settings.has('active_page') ? settings.get('active_page') : 'login.html';
}

//let active_page = settings.has('active_page') ? settings.get('active_page') : 'login.html';



loadPage(active_page)


function loadPage(page) {
    // Import and add each page to the DOM
    Array.prototype.forEach.call(links, function (link) {

        if (link.href.endsWith(page)) {
            console.log('Our page: ' + page);
            let template = link.import.querySelector('.task-template')
            let clone = document.importNode(template.content, true)
        
            let contentContainer = document.querySelector('.content');
    
            contentContainer.innerHTML = '';
            // while (contentContainer.firstChild) {
            //     contentContainer.removeChild(contentContainer.firstChild);
            // }
            console.log(clone);
            contentContainer.appendChild(clone)

            settings.set('active_page', page); 

            return;
        }

    });

    if (settings.get('active_page') !== page) {
        //settings.delete('active_page');
    }

}

// ===============
document.addEventListener('click', function(e){
    if (e.target.tagName.toLowerCase() === "a") {
        const href = e.target.getAttribute('href')
        
        if (href.indexOf('http') !== 0) {
            e.preventDefault();
            loadPage(href);
        }
    }
    
});

ipc.on('load:page',function(e, item){
    console.log('Loading page ... ' + item)
    loadPage(item)
});



