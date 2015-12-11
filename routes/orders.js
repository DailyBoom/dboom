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
var i18n = require('i18n');
var config = require('config');
var extend = require('util')._extend;
var request = require("request");
var slack = require('slack-notify')(config.get("Slack.webhookUrl"));
var CSVTransform = require('csv-transform');
var accounting = require('accounting');
var paginate = require('express-paginate');
require('mongoose-pagination');

var transporter = nodemailer.createTransport(smtpTransport({
    host: config.get('Nodemailer.host'),
    auth: {
        user: config.get('Nodemailer.auth.user'),
        pass: config.get('Nodemailer.auth.pass')
    }
}));

// As with any middleware it is quintessential to call next()
// if the user is authenticated
var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  res.redirect('/login');
}

var isMerchantOrAdmin = function (req, res, next) {
  if (req.isAuthenticated() && (req.user.admin === true || req.user.role === "merchant"))
    return next();
  res.redirect('/login');
}

var isMerchant = function (req, res, next) {
  if (req.isAuthenticated() && req.user.role === "merchant")
    return next();
  res.redirect('/login');
}

var hasShipping = function(obj) {
  if (!obj.shipping)
    return false;
  if (obj.shipping.full_name && obj.shipping.phone_number && obj.shipping.country && obj.shipping.address && obj.email)
    return true;
  return false;
}

var reservePayco = function(order) {
  var payco = {
    "sellerKey": config.get("Payco.sellerKey"),
    "sellerOrderReferenceKey": order._id,
    "totalOrderAmt": order.product.price * order.quantity + order.product.delivery_price,
    "totalDeliveryFeeAmt": 0,
    "totalPaymentAmt": order.product.price * order.quantity + order.product.delivery_price,
    "returnUrl": config.get("Payco.returnUrl"),
    "returnUrlParam" : "{\"order_id\":\""+order._id+"\"}",
    "orderMethod": "EASYPAY",
    "payMode": "PAY2",
    "orderProducts": [
        {
          "cpId": config.get("Payco.cpId"),
          "productId": config.get("Payco.productId"),
          "productAmt": order.product.price * order.quantity + order.product.delivery_price,
          "productPaymentAmt": order.product.price * order.quantity + order.product.delivery_price,
          "sortOrdering": 1,
          "productName": order.product.name+"("+order.option+")",
          "orderQuantity": order.quantity,
          "sellerOrderProductReferenceKey": order._id,
          "productImageUrl": "http://dailyboom.co/"+order.product.images[0]
        }
    ]
  };

  console.log(payco);
  return payco;
}

router.get('/orders/success', isAdmin, function(req, res) {
  res.render('mailer/buy_success');
});

router.get('/orders/shipped', isAdmin, function(req, res) {
  res.render('mailer/shipped');
});

router.get('/merchants/orders/list', isMerchant, function(req, res) {
  var page = req.query.page ? req.query.page : 1;
  var query = Order.find({ status: {$in: ["Paid", "Sent"]}, merchant_id: req.user.id }, {}, { sort: { 'created_at': -1 } }).populate('product');
  if (req.query.order_date)
    query.where('created_at').gte(req.query.order_date).lt(moment(req.query.order_date).add(1, 'days'));
  query.paginate(page, 10, function(err, orders, total) {
    res.render('orders/list', { orders: orders, pages: paginate.getArrayPages(req)(3, Math.floor(total / 10), page), currentPage: page, date: req.query.order_date ? req.query.order_date : '' });
  });
});

router.get('/orders/list', isAdmin, function(req, res) {
  var page = req.query.page ? req.query.page : 1;
  var query = Order.find({}, {}, { sort: { 'created_at': -1 } }).populate('product');
  if (req.query.order_date)
    query.where('created_at').gte(req.query.order_date).lt(moment(req.query.order_date).add(1, 'days'));
  query.paginate(page, 10, function(err, orders, total) {
    res.render('orders/list', { orders: orders, pages: paginate.getArrayPages(req)(3, Math.floor(total / 10), page), currentPage: page, date: req.query.order_date ? req.query.order_date : '' });
  });
});

router.get('/orders/view/:id', isMerchantOrAdmin, function(req, res) {
  Order.findOne({ _id: req.params.id }).populate('product user').exec(function(err, order) {
    if (err)
      console.log(err);
    if (!order)
      res.redirect('/');
    res.render('orders/view', { order: order });
  });
});

router.get('/orders/delete/:id', isAdmin, function(req, res) {
  Order.findOneAndRemove({ _id: req.params.id }, function(err, order) {
    if (err)
      console.log(err);
    res.redirect('/orders/list');
  });
});

router.get('/checkout', function(req, res) {
  if (!req.query.product_id && !req.session.product && !req.session.order)
    return res.redirect('/');
  if (req.session.product && req.query.product_id && (req.session.product != req.query.product_id)) {
    delete req.session.order;
    delete req.session.product;
  }
  
  console.log(req.session.order);
  var now;
  if (moment().day() == 0)
    now = moment().subtract(1, 'days').format("MM/DD/YYYY");
  else
    now = moment().format("MM/DD/YYYY");
  Product.findOne({_id: req.query.product_id ? req.query.product_id : req.session.product, is_published: true}, function(err, product) {
    if (err)
      console.log(err);
    if (!product)
      return res.redirect('/');
    if (product.extend == 1) {
      if (moment().isAfter(moment(product.scheduled_at).add(3, 'days'), 'days'))
        return res.redirect('/');
    }
    else if (product.extend == 2) {
      var current_quantity = 0;
      product.options.forEach(function(option) {
        current_quantity += parseInt(option.quantity);
      });
      if (current_quantity <= 0) {
        return res.redirect('/');
      }
    }
    else if (product.scheduled_at != now)
      return res.redirect('/');
    if (typeof req.session.order === 'undefined' || !req.session.order) {
      var order = new Order({
        product: product.id,
        status: "Submitted",
      });
  
      if (req.user) {
        order.user = req.user.id;
      }
  
      order.save(function(err) {
        if (err)
          res.redirect("/");
        req.session.order = order.id;
        if (!req.session.product)
          req.session.product = req.query.product_id;
          order.populate('product', function(err, orderPop) {
            if (parseInt(orderPop.product.options[0].quantity) > 0) {
              orderPop.option = orderPop.product.options[0].name;
            }
            else {
              orderPop.product.options.some(function(option){
                if (parseInt(option.quantity) > 0) {
                    orderPop.option = option.name;
                    return true;
                }
              });
            }
            orderPop.quantity = 1;
            orderPop.save(function(err) {
              if ((req.user && hasShipping(req.user)) || (hasShipping(order))) {
                var payco = reservePayco(orderPop);
                request.post(
                    config.get("Payco.host")+'/outseller/order/reserve',
                    { json: payco },
                    function (error, response, body) {
                        console.log(body)
                        if (!error && body.code == 0) {
                            var leftQuantity;
                            orderPop.product.options.forEach(function(option){
                              if (option.name === orderPop.option)
                              leftQuantity = parseInt(option.quantity);
                            });
                            res.render('checkout', { order: orderPop, orderSheetUrl: body.result.orderSheetUrl, leftQuantity: leftQuantity, title: "주문결제" });
                        }
                        else
                          res.redirect('/');
                    }
                );
              }
              else
                res.redirect('/shipping');
          });
        });
      });
    }
    else {
      Order.findOne({ '_id': req.session.order }, function(err, order) {
        if (err)
          console.log(err);
        if ((req.user && hasShipping(req.user)) || (hasShipping(order))) {
          order.populate('product', function(err, orderPop) {
            console.log(orderPop.product.options);
            if (!req.session.product)
              req.session.product = orderPop.product.id;
            var payco = reservePayco(orderPop);
            request.post(
                config.get("Payco.host")+'/outseller/order/reserve',
                { json: payco },
                function (error, response, body) {
                    console.log(body);
                    if (!error && body.code == 0) {
                        var leftQuantity;
                        orderPop.product.options.forEach(function(option){
                          console.log(orderPop.option);
                          if (option.name === orderPop.option)
                          leftQuantity = parseInt(option.quantity);
                        });
                        res.render('checkout', { order: orderPop, orderSheetUrl: body.result.orderSheetUrl, leftQuantity: leftQuantity, title: "주문결제" });
                    }
                    else
                      res.redirect('/');
                }
            );
          })
        }
        else
          res.redirect('/shipping');
      });
    }
  });
});

router.post('/checkout', function(req, res) {
  if (req.session.order) {
    Order.findOne({ '_id': req.session.order }).populate('product').exec(function(err, order) {
        if (err)
          console.log(err);
        order.option = req.body.order_option;
        order.quantity = parseInt(req.body.order_quantity);
        order.save(function(err, order) {
          if (!req.session.product)
            req.session.product = order.product.id;
          console.log(order);
          var payco = reservePayco(order);
          request.post(
              config.get("Payco.host")+'/outseller/order/reserve',
              { json: payco },
              function (error, response, body) {
                  console.log(body)
                  if (!error && body.code == 0) {
                      var leftQuantity;
                      order.product.options.forEach(function(option){
                        if (option.name === order.option)
                        leftQuantity = parseInt(option.quantity);
                      });
                      res.render('checkout', { order: order, orderSheetUrl: body.result.orderSheetUrl, leftQuantity: leftQuantity });
                  }
                  else
                    res.redirect('/');
              }
          );
        })
      });
  }
  else {
    res.redirect('/');
  }
});

router.post('/deposit_checkout', function(req, res) {
  if (req.session.order) {
    Order.findOne({ '_id': req.session.order }).populate('product').populate('user').exec(function(err, order) {
        if (err)
          console.log(err);
        order.status = "Waiting";
        order.deposit_name = req.body.deposit_name;
        if (req.user)
          order.shipping = req.user.shipping;
        order.save(function(err) {
          if (err)
            console.log(err);
          if (app.get("env") === "production") {
            slack.send({
              channel: '#dailyboom-new-order',
              icon_url: 'http://dailyboom.co/images/favicon/favicon-96x96.png',
              text: 'New order via deposit #'+order._id,
              unfurl_links: 1,
              username: 'DailyBoom-bot'
            });
          }
          fs.readFile('./views/mailer/bank_deposit.vash', "utf8", function(err, file) {
            if(err){
              //handle errors
              console.log('ERROR!');
              return res.send('ERROR!');
            }
            var html = vash.compile(file);
            moment.locale('ko');
            console.log(order);
            transporter.sendMail({
              from: 'Daily Boom <contact@dailyboom.co>',
              to: order.user ? order.user.email : order.email,
              subject: '무통장입금 안내',
              html: html({ full_name : order.user ? order.user.shipping.full_name : order.shipping.full_name, moment: moment, order: order, accounting: accounting })
            }, function (err, info) {
                if (err) { console.log(err); }
                console.log('Message sent: ' + info.response);
                transporter.close();
                res.redirect('/success');
            });
          });
        })
    });
  }
  else {
    res.redirect('/');
  }
});

router.get('/payco_callback', function(req, res) {
  console.log(req.query);
  if (req.query.code == 0) {
        var payco = {
          "sellerKey" : config.get("Payco.sellerKey"),
          "reserveOrderNo" : req.query.reserveOrderNo,
          "sellerOrderReferenceKey": req.query.sellerOrderReferenceKey,
          "paymentCertifyToken" : req.query.paymentCertifyToken,
          "totalPaymentAmt": req.query.totalPaymentAmt
        }
        request.post(
              config.get("Payco.host")+'/outseller/payment/approval',
              { json: payco },
              function (error, response, body) {
                  console.log(body)
                  if (!error && body.code == 0) {
                    Order.findOne({ _id: req.query.order_id }).populate('user').populate('product').exec(function(err, order) {
                      if (req.user)
                        order.shipping = req.user.shipping;
                      order.payco.orderNo = body.result.orderNo;
                      order.payco.sellerOrderReferenceKey = body.result.sellerOrderReferenceKey;
                      order.payco.orderCertifyKey = body.result.orderCertifyKey;
                      order.payco.totalOrderAmt = body.result.totalOrderAmt;
                      order.payco.paymentDetails = body.result.paymentDetails;
                      order.merchant_id = order.product.merchant_id;
                      order.status = "Paid";
                      order.save(function(err) {
                        Product.findOne({ _id: order.product.id }, function(err, product) {
                          product.options.forEach(function(option){
                            if (option.name === order.option)
                              option.quantity -= order.quantity;
                          });
                          product.markModified('options');                          
                          product.save(function(err) {
                            if (app.get("env") === "production") {
                              slack.send({
                                channel: '#dailyboom-new-order',
                                icon_url: 'http://dailyboom.co/images/favicon/favicon-96x96.png',
                                text: 'New order #'+order._id,
                                unfurl_links: 1,
                                username: 'DailyBoom-bot'
                              });
                            }
                            fs.readFile('./views/mailer/buy_success.vash', "utf8", function(err, file) {
                              if(err){
                                //handle errors
                                console.log('ERROR!');
                                return res.send('ERROR!');
                              }
                              var html = vash.compile(file);
                              transporter.sendMail({
                                from: 'Daily Boom <contact@dailyboom.co>',
                                to: order.user ? order.user.email : order.email,
                                subject: '데일리 붐 구매 안내.',
                                html: html({ full_name : order.user ? order.user.shipping.full_name : order.shipping.full_name })
                              }, function (err, info) {
                                  if (err) { console.log(err); res.render('payco_callback', { error: err.errmsg }); }
                                  console.log('Message sent: ' + info.response);
                                  transporter.close();
                                  res.render('payco_callback', {code: req.query.code});
                              });
                            });
                          });
                        });
                      });
                    });
                  }
                  else {
                    res.render('payco_callback', { msg: body.message, code: req.query.code });
                  }
              }
          );
  }
  else {
    res.render('payco_callback', { msg: "ERROR", code: req.query.code });
  }
});

router.get('/success', function(req, res) {
  if (!req.session.order)
    res.redirect('/');
  Order.findOne({_id: req.session.order, status: {$in : ['Paid', 'Waiting']}}).populate('product').exec(function(err, order) {
    if (err)
      console.log(err)
    if (!order)
      res.redirect('/');
    delete req.session.order;
    res.render('success', { code: req.query.code, order: order, title: "주문 완료", description: "고객님, 데일리 붐을 이용해 주셔서 감사합니다." });
  });
});

router.get('/orders/paid/:id', isAdmin, function(req, res) {
  Order.findOne({ '_id': req.params.id }).populate('product').populate('user').exec(function(err, order) {
      if (err)
        console.log(err);
      if (!order)
        res.redirect('/mypage');
      order.merchant_id = order.product.merchant_id;
      order.status = "Paid";
      order.save(function(err) {
        if (err)
          console.log(err);
        Product.findOne({ _id: order.product }, function(err, product) {
          console.log(product.options);
          product.options.forEach(function(option){
            if (option.name === order.option) {
              option.quantity -= order.quantity;
              console.log(product.options);
              product.markModified('options');
              product.save(function(err) {
                if (err)
                  console.log(err);
                fs.readFile('./views/mailer/buy_success.vash', "utf8", function(err, file) {
                  if(err){
                    //handle errors
                    console.log('ERROR!');
                    return res.send('ERROR!');
                  }
                  var html = vash.compile(file);
                  moment.locale('ko');
                  transporter.sendMail({
                    from: 'Daily Boom <contact@dailyboom.co>',
                    to: order.user ? order.user.email : order.email,
                    subject: '데일리 붐 구매 안내.',
                    html: html({ full_name : order.user ? order.user.shipping.full_name : order.shipping.full_name, moment: moment })
                  }, function (err, info) {
                      if (err) { console.log(err); }
                      console.log('Message sent: ' + info.response);
                      transporter.close();
                      res.redirect('/orders/list');
                  });
                });
              });
          }
        });
      });
    });
  });
});

router.get('/orders/send/:id', isMerchantOrAdmin, function(req, res) {
  Order.findOne({_id: req.params.id}).populate('user').exec(function(err, order) {
    if (err)
      console.log(err);
    if (!order)
      res.redirect('/mypage');
    order.status = "Sent";
    order.save(function(err) {
      fs.readFile('./views/mailer/shipped.vash', "utf8", function(err, file) {
        if(err){
          //handle errors
          console.log('ERROR!');
          return res.send('ERROR!');
        }
        var html = vash.compile(file);
        moment.locale('ko');
        transporter.sendMail({
          from: 'Daily Boom <contact@dailyboom.co>',
          to: order.user ? order.user.email : order.email,
          subject: '데일리 붐 배송 안내.',
          html: html({ moment: moment, order: order, accounting: accounting })
        }, function (err, info) {
            if (err) { console.log(err); }
            console.log('Message sent: ' + info.response);
            transporter.close();
            res.redirect('/mypage');
        });
      });
    });
  });
});

router.get('/orders/cancel/:id', function(req, res) {
  Order.findOne({ _id: req.params.id }).populate('user').exec(function(err, order) {
    if (err)
      console.log(err);
    if (!order || moment().isAfter(order.created_at, 'days'))
      res.redirect('/mypage');
    var payco = {
      "sellerKey" : config.get("Payco.sellerKey"),
      "orderNo" : order.payco.orderNo,
      "sellerOrderReferenceKey": order.payco.sellerOrderReferenceKey,
      "orderCertifyKey" : order.payco.orderCertifyKey,
      "cancelTotalAmt": order.payco.totalOrderAmt
    };
    request.post(
      config.get("Payco.host")+'/outseller/order/cancel',
      { json: payco },
      function (error, response, body) {
        console.log(body);
        if (!error && body.code == 0) {
          order.status = "Cancelled";
          order.payco.cancelTradeSeq = body.result.cancelTradeSeq;
          order.payco.cancelPaymentDetails = body.result.cancelPaymentDetails;
          order.save(function(err) {
            if (err)
              console.log(err);
            Product.findOne({ _id: order.product }, function(err, product) {
              product.options.forEach(function(option){
                if (option.name === order.option)
                  option.quantity += order.quantity;
              });
              product.markModified('options');                          
              product.save(function(err) {
                if (app.get("env") === "production") {
                  slack.send({
                    channel: '#dailyboom-new-order',
                    icon_url: 'http://dailyboom.co/images/favicon/favicon-96x96.png',
                    text: 'Cancel order #'+order._id,
                    unfurl_links: 1,
                    username: 'DailyBoom-bot'
                  });
                }
                fs.readFile('./views/mailer/order_cancelled.vash', "utf8", function(err, file) {
                  if(err){
                    //handle errors
                    console.log('ERROR!');
                    return res.send('ERROR!');
                  }
                  var html = vash.compile(file);
                  moment.locale('ko');
                  transporter.sendMail({
                    from: 'Daily Boom <contact@dailyboom.co>',
                    to: order.user ? order.user.email : order.email,
                    subject: '데일리 붐 주문 취소 안내',
                    html: html({ moment: moment, order: order, accounting: accounting })
                  }, function (err, info) {
                      if (err) { console.log(err); }
                      console.log('Message sent: ' + info.response);
                      transporter.close();
                      res.redirect('/mypage');
                  });
                });
              });
            });
          });
        }
      });
  });
});

router.get('/orders/cancel_deposit/:id', function(req, res) {
  Order.findOne({ _id: req.params.id }).populate('user').exec(function(err, order) {
    if (err)
      console.log(err);
    if (!order)
      res.redirect('/mypage');
    order.status = "Cancelled";
    order.save(function(err) {
      if (err)
        console.log(err);
      if (app.get("env") === "production") {
        slack.send({
          channel: '#dailyboom-new-order',
          icon_url: 'http://dailyboom.co/images/favicon/favicon-96x96.png',
          text: 'Cancel deposit order #'+order._id,
          unfurl_links: 1,
          username: 'DailyBoom-bot'
        });
      }
      fs.readFile('./views/mailer/order_cancelled.vash', "utf8", function(err, file) {
        if(err){
          //handle errors
          console.log('ERROR!');
          return res.send('ERROR!');
        }
        var html = vash.compile(file);
        moment.locale('ko');
        transporter.sendMail({
          from: 'Daily Boom <contact@dailyboom.co>',
          to: order.user ? order.user.email : order.email,
          subject: '데일리 붐 주문 취소 안내',
          html: html({ moment: moment, order: order, accounting: accounting })
        }, function (err, info) {
            if (err) { console.log(err); }
            console.log('Message sent: ' + info.response);
            transporter.close();
            res.redirect('/mypage');
        });
      });
    });
  });
});

router.get('/shipping', function(req, res) {
  if (!req.session.order)
    res.redirect('/');
  else
    res.render('shipping', { title: "배송지 정보" });
});

router.post('/shipping', function(req, res) {
  if (!req.session.order)
    return res.redirect('/');
  Order.findOne({ '_id': req.session.order }, function(err, order) {
    if (err) {
      console.log(err);
      return res.redirect('/');
    }
    req.Validator.validate('full_name', i18n.__('user.fullName'), {
        required: true
      })
      .validate('phone_number', i18n.__('user.phoneNumber'), {
        required: true,
        numeric: true
      })
      .validate('address1', i18n.__('user.address1'), {
        required: true
      })
      .validate('zipcode', i18n.__('user.zipcode'), {
        numeric: true
      })
      .validate('country', i18n.__('user.country'), {
        required: true
      });

      if (req.body.add_id && !req.user) {
          req.Validator.validate('username', i18n.__('user.username'), {
            length: {
              min: 3,
              max: 20
            },
            required: true
          })
          .validate('email', i18n.__('user.email'), {
            required: true
          })
          .validate('password', i18n.__('user.password'), {
            length: {
              min: 8,
              max: 15
            },
            required: true
          })
          .validate('confirmpassword', i18n.__('user.confirmPassword'), {
            length: {
              min: 8,
              max: 15
            },
            isConfirm: function(field, fieldName, value, fn) {
              var errors;
              if (value !== req.body.password) {
                errors = i18n.__('passNotConfirmed', fieldName, i18n.__('user.password'));
              }
              fn(errors);
            },
            required: true
          })
          .validate('agree-terms-1', i18n.__('user.agreeTerms1'), {
            required: true
          })
          .validate('agree-terms-3', i18n.__('user.agreeTerms3'), {
            required: true
          });

          req.Validator.getErrors(function(errors){
            if (errors.length > 0) {
              res.render('shipping', { errors: errors });
            }
            else {
              var user = new User({
                username: req.body.username,
                password: req.body.password,
                email: req.body.email,
                role: 'user',
                shipping: {
                  full_name: req.body.full_name,
                  address: req.body.address1,
                  country: req.body.country,
                  zipcode: req.body.zipcode,
                  phone_number: req.body.phone_number
                }
              });
              user.save(function(err) {
                if (err) {
                  console.log(err);
                  var errors = [];
                  for (var path in err.errors) {
                    errors.push(i18n.__("unique", i18n.__("user."+path)));
                  }
                  res.render('shipping', { errors: errors, title: "배송지 정보" });
                }
                else {
                  order.user = user.id;
                  order.save(function(err) {
                    fs.readFile('./views/mailer/signup.vash', "utf8", function(err, file) {
                      if(err){
                        //handle errors
                        console.log('ERROR!');
                        return res.send('ERROR!');
                      }
                      var html = vash.compile(file);
                      transporter.sendMail({
                        from: 'Daily Boom <contact@dailyboom.co>',
                        to: user.email,
                        subject: user.username+'님 회원가입을 축하드립니다.',
                        html: html({ user : user })
                      }, function (err, info) {
                          if (err) { console.log(err); res.render('signup', { error: err.errmsg }); }
                          console.log('Message sent: ' + info.response);
                          transporter.close();
                          req.login(user, function(err) {
                            if (err) {
                              console.log(err);
                            }
                            return res.redirect('/');
                          });
                      });
                    });
                  });
                }
              });
            }
          });
      }
      else if (req.user) {
        if (!req.user.email) {
          req.Validator.validate('email', i18n.__('user.email'), {
            required: true
          })
        }

        req.Validator.getErrors(function(errors){
          if (errors.length > 0) {
            res.render('shipping', { errors: errors, title: "배송지 정보" });
          }
          else {
            var user = req.user;

            if (!req.user.email) {
              user.email = req.body.email;
            }

            user.shipping = {
              full_name: req.body.full_name,
              address: req.body.address1,
              country: req.body.country,
              zipcode: req.body.zipcode,
              phone_number: req.body.phone_number
            }
            user.save(function(err) {
              if (err) {
                  console.log(err);
                  var errors = [];
                  for (var path in err.errors) {
                    errors.push(i18n.__("unique", i18n.__("user."+path)));
                  }
                res.render('shipping', { errors: errors, title: "배송지 정보" });
              }
              else {
                order.user = user.id;
                order.save(function(err) {
                  if (err) {
                    res.render('shipping', { errors: err, title: "배송지 정보" });
                  }
                  else {
                    res.redirect('/checkout');
                  }
                });
              }
            });
          }
        });
      }
      else {
        req.Validator.validate('email', i18n.__('user.email'), {
            required: true
        });

        req.Validator.getErrors(function(errors){
          if (errors.length > 0) {
            res.render('shipping', { errors: errors, title: "배송지 정보" });
          }
          else {
            order.shipping = {
                full_name: req.body.full_name,
                address: req.body.address1,
                country: req.body.country,
                zipcode: req.body.zipcode,
                phone_number: req.body.phone_number
            }
            order.email = req.body.email;
            order.save(function(err) {
              if (err) {
                res.render('shipping', { errors: err, title: "배송지 정보" });
              }
              else {
                  res.redirect('/checkout');
              }
            });
          }
        });
      }
  });
});

router.get('/orders/export', isAdmin, function(req, res) {
  res.setHeader('Content-disposition', 'attachment; filename=orders_'+moment().format("YYYYMMDDHHmmss")+'.csv'); 
  res.set('Content-Type', 'text/csv; charset=utf-8'); 
  res.write(new Buffer('EFBBBF', 'hex'));
  res.status(200);
  var query = Order.find({status: {$in: ["Paid", "Sent"]}}, {}, {sort: {created_at: -1}});
  if (req.query.date)
    query.where('created_at').gte(req.query.date).lt(moment(req.query.date).add(1, 'days'));
  query.stream().pipe(Order.csvTransformStream()).pipe(res);
});

router.get('/orders/merchants/export', isMerchant, function(req, res) {
  res.setHeader('Content-disposition', 'attachment; filename=orders_'+moment().format("YYYYMMDDHHmmss")+'.csv'); 
  res.set('Content-Type', 'text/csv; charset=utf-8'); 
  res.write(new Buffer('EFBBBF', 'hex'));
  res.status(200);
  var query = Order.find({status: {$in: ["Paid", "Sent"]}, merchant_id: req.user.id}, {}, {sort: {created_at: -1}});
  if (req.query.date)
    query.where('created_at').gte(req.query.date).lt(moment(req.query.date).add(1, 'days'));
  query.stream().pipe(Order.csvTransformStream()).pipe(res);
});

module.exports = router;
