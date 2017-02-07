var express = require('express'),
	expressValidator = require('express-validator')
var util = require('util'),
	bodyParser = require('body-parser')

var mime = require('mime-types')
var http = require('http');
var https = require('https');

var sharp = require('sharp')

var app = express()
app.use('/', express.static('public'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))
app.use(expressValidator())

app.get('/', function (req, res) {
	res.json({
		isReady: true
	})
})
app.get('/resize/auto', function (req, res) {
	req.checkQuery('image_url').notEmpty()
	req.checkQuery('rules').notEmpty()

	req.getValidationResult().then(function (result) {
		if (!result.isEmpty()) {
			res.status(400).send('There have been validation errors: ' + util.inspect(result.array()));
			return;
		}

	})
})
app.get('/resize', function (req, res) {
	req.checkQuery('width').notEmpty().isInt()
	req.checkQuery('height').optional(true).isInt()
	req.checkQuery('type').notEmpty()
	req.checkQuery('image_url').notEmpty()

	req.getValidationResult().then(function (result) {
		if (!result.isEmpty()) {
			res.status(400).send('There have been validation errors: ' + util.inspect(result.array()));
			return;
		}
		var width = req.query['width']
		var height = req.query['height'] ? req.query['height'] : width
		var imageUri = req.query['image_url']
		var type = req.query['type']
		width = parseInt(width)
		height = parseInt(height)

		var httpLib = http;
		if (/^https/.test(imageUri)) {
			httpLib = https;
		}
		var filename = imageUri.split('/').pop()
		const ext = filename.split('.').pop()
		var resMime = mime.lookup(ext)
		var resizeTransform = sharp().resize(width, height)
		switch(type){
			case "STRETCH":
				resizeTransform = resizeTransform.ignoreAspectRatio().jpeg({quality: 90})
				break;
			case "CROP":
				resizeTransform = resizeTransform.crop().jpeg({quality: 90})
				break;
			case "MAX":
				resizeTransform = resizeTransform.max().jpeg({quality: 90})
				break;
			case "MIN":
				resizeTransform = resizeTransform.min().jpeg({quality: 90})
				break;
			case "EMBED":
				resMime = mime.lookup('png')
				filename = filename.replace('.' + ext, '.png')
				resizeTransform = resizeTransform
					.background({r: 0, g: 0, b: 0, alpha: 0})
					.embed()
					.toFormat(sharp.format.png)
				break;
		}
		res.writeHead(200, {
			'Content-Type': resMime,
			'Content-disposition': 'attachment;filename=' + filename
		});
		httpLib.get(imageUri, function (downloadStream) {
			downloadStream.pipe(resizeTransform).pipe(res)
			downloadStream.on('end', function () {
				console.log('downloadStream', 'END');
			});

			downloadStream.on('error', function (err) {
				console.log('download error', err);
			});

			resizeTransform.on('error', function (err) {
				console.log('resizeTransform', err);
			});
		});
	})
})

var port = process.env.PORT || 3000

app.listen(port, function () {
	console.log('App listening on port:' + port)
})