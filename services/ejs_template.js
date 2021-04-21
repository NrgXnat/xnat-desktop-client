const { app } = require('electron').remote
const ejs = require('ejs')
const path = require('path')
const fs = require('fs')

/*
let myFileLoader = function (filePath) {
	return 'myFileLoader: ' + fs.readFileSync(filePath);
};

ejs.fileLoader = myFileLoader;
*/

module.exports = (template_file, data) => {
	const options = {
		cache: true,
	}
    const filename = path.join(app.getAppPath(), 'assets/ejs', `${template_file}.ejs`)
	
	return new Promise((resolve, reject) => {
		ejs.renderFile(
			filename, 
			data, 
			options, 
			function(err, str){
				// str => Rendered HTML string
				if (err) {
					reject(err)
				} else {
					resolve(str)
				}
				
			}
		)
	})
    
}