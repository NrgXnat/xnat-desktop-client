const settings = require('electron-settings')
const links = document.querySelectorAll('link[rel="import"]')


// settings.set('active_page', 'about.html')

let active_page = settings.get('active_page');
console.log('active_page: ' + active_page);

if (!active_page) {
    active_page = 'about.html';
}

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
            contentContainer.appendChild(clone)

            settings.set('active_page', page); 

            return;
        }

    });

    if (settings.get('active_page') !== page) {
        settings.delete('active_page');
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



