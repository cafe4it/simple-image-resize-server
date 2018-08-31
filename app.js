var express = require('express'),
    expressValidator = require('express-validator'),
    cors = require('cors');
var util = require('util'),
    bodyParser = require('body-parser')

var mime = require('mime-types')
var http = require('http');
var https = require('https');
var request = require('request');
var sharp = require('sharp')

var app = express()
app.use('/', express.static('public'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: true}))
app.use(expressValidator())

app.get('/', function (req, res) {
    res.json({
        isReady: true,
        version: '0.0.3'
    })
})

app.get('/jpeg', function (req, res) {
    req.checkQuery('image_url').notEmpty()
    req.getValidationResult().then(function (result) {
        if (!result.isEmpty()) {
            res.status(400).send('There have been validation errors: ' + util.inspect(result.array()));
            return;
        }
        var imageUrl = req.query['image_url']
        var imageConvert = sharp().jpeg({
            quality: 100,
            chromaSubsampling: '4:4:4'
        })
        var httpLib = http;
        if (/^https/.test(imageUrl)) {
            httpLib = https;
        }

        var filename = imageUrl.split('/').pop()
        var ext = filename.split('.').pop()
        var resMime = mime.lookup('jpg')
        filename = filename.replace('.' + ext, '.jpg')
        res.writeHead(200, {
            'Content-Type': resMime,
            'Content-disposition': 'attachment;filename=' + filename
        });


        httpLib.get(imageUrl, function (downloadStream) {
            downloadStream.pipe(imageConvert).pipe(res)
            downloadStream.on('end', function () {
                console.log('downloadStream', 'END');
            });

            downloadStream.on('error', function (err) {
                console.log('download error', err);
            });

            imageConvert.on('error', function (err) {
                console.log('convert Error', err);
            });
        });
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
        var ext = filename.split('.').pop()
        var resMime = mime.lookup(ext)
        var resizeTransform = sharp().resize(width, height)
        switch (type) {
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
                    .png()
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

const asyncMiddleware = fn =>
    (req, res, next) => {
        Promise.resolve(fn(req, res, next))
            .catch(next);
    };

const serialize = function (obj, prefix) {
    var str = [], p;
    for (p in obj) {
        if (obj.hasOwnProperty(p)) {
            var k = prefix ? prefix + "[" + p + "]" : p, v = obj[p];
            str.push((v !== null && typeof v === "object") ?
                serialize(v, k) :
                encodeURIComponent(k) + "=" + encodeURIComponent(v));
        }
    }
    return str.join("&");
}


function fetchImages(productId, limitPage) {
    try {
        let allImages = []
        return new Promise(resolve => {

            function fetchNext(currentPage) {
                const options = {
                    method: 'GET',
                    url: `https://m.aliexpress.com/api/products/${productId}/feedbacks`,
                    qs: {page: currentPage, filter: 'image'},
                    headers:
                        {
                            'Postman-Token': 'fadf8fa1-ec04-42ae-8519-eb6ccdc92a06',
                            'Cache-Control': 'no-cache',
                            referer: `https://m.aliexpress.com/item/${productId}.html`
                        }
                };
                // console.log(options)
                request(options, function (error, response, body) {
                    if (error) throw new Error(error);
                    // console.log(response)
                    const {data} = JSON.parse(body);
                    const totalPage = data['totalPage'] > limitPage ? limitPage : data['totalPage'];
                    const allImageList = data['allImageList']
                    allImages = allImages.concat(allImageList)
                    currentPage++;
                    currentPage <= totalPage ? fetchNext(currentPage) : resolve(allImages)
                });
            }

            fetchNext(1)
        })

    } catch (e) {
        console.log(e)
    }
}

app.get('/feedback', cors(), asyncMiddleware(async function (req, res, next) {
    req.checkQuery('productId').notEmpty();
    req.checkQuery('_totalPage').notEmpty().isInt();

    const productId = req.query['productId'];
    let _totalPage = parseInt(req.query['_totalPage']);

    const images = await fetchImages(productId, _totalPage)
    res.json(images || [])
}))

var port = process.env.NODE_ENV === 'production' ? 80 : 5001

app.listen(port, function () {
    console.log('App listening on port:' + port)
})