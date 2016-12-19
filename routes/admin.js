var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");
var moment = require('moment');
var User = require('../models/user');
var Product = require('../models/product');
var Coupon = require('../models/coupon');
var Comment = require('../models/comment');
var Partner = require('../models/partner');
var Article = require('../models/article');
var Behavior = require('../models/behavior');

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var isAdmins = function (req, res, next) {
  if (req.isAuthenticated() && (req.user.admin === true || req.user.role === "content" || req.user.role === "merchant"))
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

router.get('/admin/dashboard', isAdmins, function(req, res) {
    res.render('admin/dashboard');
});

router.get('/behaviors/zone', isAdmin, function(req, res) {
    Behavior.aggregate([
        {$group: {
            _id: '$zone',
            count: {$sum: 1}
        }},
        {$sort: {
            _id: 1
        }}
    ], function(err, behaviors) {
        console.log(behaviors);
        var result = behaviors.map(function(a) {return a.count;});
        console.log(result);
        res.render('behaviors/zone', { result: result });
    });
});

module.exports = router;
