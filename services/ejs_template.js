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

const renderFile = (template_file, data) => {
	const options = {
		cache: true
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

module.exports = renderFile

module.exports.compile = (template_file) => {
	const options = {
		client: true
	}
	const filename = path.join(app.getAppPath(), 'assets/ejs', `${template_file}.ejs`)

	const str = fs.readFileSync(filename, {encoding: 'utf8', flag: 'r'})
	
	return ejs.compile(
		str, 
		options
	)
}

