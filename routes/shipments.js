var express = require('express');
var app = express();
var router = express.Router();
var mongoose = require("mongoose");
var moment = require("moment");
var fs = require("fs");
var vash = require("vash");
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var User = require('../models/user');
var Product = require('../models/product');
var Order = require('../models/order');
var Coupon = require('../models/coupon');
var Comment = require('../models/comment');
var Shipment = require('../models/shipment');
var i18n = require('i18n');
var config = require('config-heroku');
var slack = require('slack-notify')(config.Slack.webhookUrl);
var extend = require('util')._extend;
var request = require("request");
var CSVTransform = require('csv-transform');
var accounting = require('accounting');
var paginate = require('express-paginate');
require('mongoose-pagination');

var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var isMerchantOrAdmin = function (req, res, next) {
  if (req.isAuthenticated() && (req.user.admin === true || req.user.role === "merchant"))
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var isMerchant = function (req, res, next) {
  if (req.isAuthenticated() && req.user.role === "merchant")
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

router.get('/shipments/list', isMerchantOrAdmin, function(req, res) {
  var page = req.query.page ? req.query.page : 1;
  var query = Shipment.find({}, {}, { sort: { 'created_at': -1 } }).populate('product');
  if (req.query.order_date)
    query.where('created_at').gte(req.query.order_date).lt(moment(req.query.order_date).add(1, 'days'));
  if (req.query.status)
    query.where('status').equals(req.query.status);
  query.paginate(page, 10, function(err, shipments, total) {
    res.render('shipments/list', { shipments: shipments, pages: paginate.getArrayPages(req)(3, Math.ceil(total / 10), page), currentPage: page, date: req.query.order_date ? req.query.order_date : '' });
  });
});

router.get('/shipments/delete/:id', isMerchantOrAdmin, function(req, res) {
  Shipment.findOneAndRemove({ _id: req.params.id }, function(err, shipment) {
    res.redirect('/shipments/list');
  });
});

router.post('/shipments/new', isMerchantOrAdmin, function(req, res) {
  console.log(req.body);
  
  var shipment = new Shipment({
    name: req.body.name,
    line: req.body.line,
    quantity: req.body.quantity,
    price: req.body.price,
    from: req.body.from,
    est_date: req.body.est_date,
    note: req.body.note,
    status: "Submitted"
  });

  shipment.save(function(err) {
    if (err)
      console.log(err);
    return res.redirect('/shipments/list');
  })
});

router.post('/shipments/edit/:id', isMerchantOrAdmin, function(req, res) {
  console.log(req.body);
  
  Shipment.findOne({ _id: req.params.id }, {}, function(err, shipment){
    
    shipment.rec_quantity = req.body.rec_quantity;
    shipment.brk_quantity = req.body.brk_quantity;
    shipment.to = req.body.to;
    shipment.arr_date = req.body.arr_date;
    shipment.note = req.body.note;
    shipment.status = "Arrived";

    shipment.save(function(err) {
      if (err)
        console.log(err);
      return res.redirect('/shipments/list');
    });
  });
});

router.get('/shipments/view/:id', isMerchantOrAdmin, function(req, res) {
  Shipment.findOne({ _id: req.params.id }, function(err, shipment) {
    if (err)
      console.log(err);
    if (!shipment)
      res.redirect('/');
    res.render('shipments/view', { shipment: shipment });
  });
});

module.exports = router;
