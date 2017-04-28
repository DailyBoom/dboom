var express = require('express');
var app = express();
var router = express.Router();
var mongoose = require("mongoose");
var multer  = require('multer');
var multers3 = require('multer-s3');
var Homepage = require('../models/homepage');
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

router.get('/homepage/edit', isAdmin, function(req, res) {
    Homepage.findOne({}, function(err, homepage) {
        res.render('homepage/edit', { homepage: homepage });
    });
});

router.post('/homepage/edit', isAdmin, upload.fields([{ name: "main_banner" }, { name: "right_1_banner" }, { name: "right_2_banner" }, { name: "deal_banner" }, { name: "fav_banner" }, { name: "organic_banner" }, { name: "review_1_banner" }, { name: "review_2_banner" }, { name: "review_3_banner" }, { name: "review_1_avatar" }, { name: "review_2_avatar" }, { name: "review_3_avatar" }]), function(req, res) {
    Homepage.findOne({}, function(err, homepage) {

        homepage.main_banner = req.body.main_banner;
        homepage.right_1_banner = req.body.right_1_banner;
        homepage.right_2_banner = req.body.right_2_banner;

        if (req.files['main_banner'])
            homepage.main_banner.banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['main_banner'][0].key
        if (req.files['right_1_banner'])
            homepage.right_1_banner.banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['right_1_banner'][0].key
        if (req.files['right_2_banner'])
            homepage.right_2_banner.banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['right_2_banner'][0].key
        if (req.files['deal_banner'])
            homepage.deal_banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['deal_banner'][0].key
        if (req.files['fav_banner'])
            homepage.fav_banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['fav_banner'][0].key
        if (req.files['organic_banner'])
            homepage.organic_banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['organic_banner'][0].key

        console.log(req.body);
        homepage.reviews = req.body.reviews;

        if (req.files['review_1_banner'])
            homepage.reviews[0].banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['review_1_banner'][0].key
        if (req.files['review_2_banner'])
            homepage.reviews[1].banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['review_2_banner'][0].key
        if (req.files['review_3_banner'])
            homepage.reviews[2].banner = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['review_3_banner'][0].key
        if (req.files['review_1_avatar'])
            homepage.reviews[0].avatar = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['review_1_avatar'][0].key
        if (req.files['review_2_avatar'])
            homepage.reviews[1].avatar = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['review_2_avatar'][0].key
        if (req.files['review_3_avatar'])
            homepage.reviews[2].avatar = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['review_3_avatar'][0].key

        homepage.save(function(err) {
            if (err)
                console.log(err);
            return res.redirect('/homepage/edit');
        })
    });
});

module.exports = router;
