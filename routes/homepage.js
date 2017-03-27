var express = require('express');
var app = express();
var router = express.Router();
var mongoose = require("mongoose");
var multer  = require('multer');
var s3 = require('multer-s3');
var Homepage = require('../models/homepage');

var storage = s3({
    dirname: 'uploads',
    bucket: 'dailyboom',
    secretAccessKey: config.Amazon.secretAccessKey,
    accessKeyId: config.Amazon.accessKeyId,
    region: 'ap-northeast-2',
    filename: function (req, file, cb) {
        console.log(file);
        cb(null, Date.now() + file.originalname.replace(/ /g,"-"));
    }
});

var upload = multer({ storage: storage });
