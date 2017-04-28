var express = require('express');
var app = express();
var router = express.Router();
var mongoose = require("mongoose");
var multer  = require('multer');
var multers3 = require('multer-s3');
var Mall = require('../models/mall');
var config = require('config-heroku');
var aws = require('aws-sdk');


var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var s3 = new aws.S3({
    aws_secret_access_key: config.Amazon.secretAccessKey,
    aws_access_key_id: config.Amazon.accessKeyId,
    region: 'ap-northeast-2',
    s3Options: {
      accessKeyId: config.Amazon.accessKeyId,
      secretAccessKey: config.Amazon.secretAccessKey,
    }
});

var storage = multers3({
    s3: s3,
    bucket: 'dailyboom',
    cacheControl: 'max-age=31536000',
    metadata: function (req, file, cb) {
      cb(null, {fieldName: file.fieldname});
    },
    key: function (req, file, cb) {
      cb(null, Date.now().toString() + file.originalname)
    }
})

var upload = multer({ storage: storage });

router.get('/mall/edit', function(req, res) {
    res.render('mall/edit');
});

router.post('/mall/edit', upload.single('banner'), function(req, res) {
  Mall.findOne({ category: req.body.category }, function(err, mall) {
    if (!mall) {
      var newMall = new Mall({
        category: req.body.category,
        title: req.body.title,
        text: req.body.text,
        banner: req.file.location
      });
      newMall.save(function(err) {
        res.redirect('/mall/edit');
      });
    }
    else {
      mall.title = req.body.title;
      mall.text = req.body.text;
      if (req.file) {
        mall.banner = req.file.location
      }
      mall.save(function(err) {
        res.redirect('/mall/edit');
      });
    }
  });
});

module.exports = router;
