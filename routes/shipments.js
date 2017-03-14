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
  if (req.query.s_id)
    query.where('id').equals(req.query.s_id);
  if (req.query.s_name) {
    var regex = new RegExp(req.query.s_name, "i");
    query.where('name').regex(regex);
  }
  if (req.query.s_line)
    query.where('line').equals(req.query.s_line);
  if (req.query.s_price)
    query.where('price').equals(req.query.s_price);
  if (req.query.s_quantity)
    query.where('quantity').equals(req.query.s_quantity);
  if (req.query.s_from) {
    var regex = new RegExp(req.query.s_from, "i");
    query.where('from').regex(regex);
  }
  if (req.query.s_est_date)
    query.where('est_date').equals(req.query.s_est_date);
  if (req.query.s_status)
    query.where('status').equals(req.query.s_status);
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
    status: "Shipping"
  });

  shipment.save(function(err) {
    if (err)
      console.log(err);
    return res.redirect('/shipments/list');
  })
});

router.post('/shipments/edit/:id', isMerchantOrAdmin, function(req, res) {
  Shipment.findOne({ _id: req.params.id }, {}, function(err, shipment){
    
    shipment.quantity = req.body.e_quantity;
    shipment.price = req.body.e_price;
    shipment.from = req.body.e_from;
    shipment.est_date = req.body.e_est_date;
    shipment.rec_quantity = req.body.rec_quantity;
    shipment.brk_quantity = req.body.brk_quantity;
    shipment.to = req.body.to;
    shipment.arr_date = req.body.arr_date;
    shipment.note = req.body.e_note;
    shipment.status = req.body.e_status;

    shipment.save(function(err) {
      if (err)
        console.log(err);
      return res.redirect('/shipments/list');
    });
  });
});

router.post('/shipments/edit_note/:id', isMerchantOrAdmin, function(req, res) {
  Shipment.findOne({ _id: req.params.id }, {}, function(err, shipment){
    
    shipment.note = req.body.e_note;

    shipment.save(function(err) {
      if (err)
        console.log(err);
      return res.redirect('back');
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
