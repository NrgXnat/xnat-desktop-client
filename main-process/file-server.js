
const http = require('http');  
const url = require('url');
const fs = require('fs');     // to help serve a local video file


// Create an instance of the http server to handle HTTP requests
let server = http.createServer((req, res) => {  
    
    // Use the url module to turn the querystring into an object:
    let q = url.parse(req.url, true).query;

    let pathname = q.path;

    console.log(pathname)

    if (pathname === undefined) {
        res.writeHead(404, {'Content-Type': 'text/html'});
        res.write('Path not provided');
        res.end();
    } else {
        // Set a response type of mp4 video for the response
        res.writeHead(200, {'Content-Type': 'image/jpeg'});

        // Read the video into a stream
        // let stream = fs.createReadStream(pathname);
        fs.createReadStream(pathname)
            .pipe(res)
            .on('error', function(error) {
                res.writeHead(404, {'Content-Type': 'text/html'});
                res.write('404: File Not Found!');
                res.end();
            })
            .on('finish', () => {
                console.log('stream finished');
                res.end();
            });
    }
    
    
	
});

// Start the server on port 3000
server.listen(7714, '127.0.0.1');  
console.log('Node server running on port 7714');  