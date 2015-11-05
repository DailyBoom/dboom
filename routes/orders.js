var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var User = require('../models/user');
var Product = require('../models/product');
var Order = require('../models/order');
var i18n = require('i18n');
var config = require('config');
var extend = require('util')._extend;
var request = require("request");

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

var hasShipping = function(obj) {
  if (!obj.shipping)
    return false;
  if (obj.shipping.full_name && obj.shipping.phone_number && obj.shipping.country && obj.shipping.address && obj.shipping.zipcode)
    return true;
  return false;
}

router.post('/orders/new', isAuthenticated, function(req, res) {
  var order = new Order({
    user: req.user.id,
    product: req.query.product_id,
    status: "Submitted"
  })
  
  order.save(function(err) {
    if (err) res.redirect("/");
    else res.redirect("/");
  });
});


router.get('/checkout', function(req, res) {
  if (!req.query.product_id && !req.session.product && !req.session.order)
    return res.redirect('/');
    
  if (!req.session.order) {
    var order = new Order({
      product: req.query.product_id ? req.query.product_id : req.session.product,
      status: "Submitted"
    })
    
    if (req.user) {
      order.user = req.user.id;
    }
    
    order.save(function(err) {
      if (err) res.redirect("/");
      req.session.order = order.id;
      if ((req.user && hasShipping(req.user))) {
        order.populate('product', function(err, orderPop) {
          var payco = {
            "sellerKey": "S0FSJE",
            "sellerOrderReferenceKey": order._id,
            "totalOrderAmt": orderPop.product.price,
            "totalDeliveryFeeAmt": "0",
            "totalPaymentAmt": orderPop.product.price,
            "serviceUrl": "http://dailyboom.co/success",
            "serviceUrlParam" : "{\"order_id\":\""+order._id+"\",\"returnUrlParam2\":300}",     
            "returnUrl": "http://dailyboom.co/success",
            "returnUrlParam" : "{\"order_id\":\""+order._id+"\",\"returnUrlParam2\":300}",
            "orderMethod": "EASYPAY_F",
            "orderProducts": [
                {
                  "cpId": "PARTNERTEST",
                  "productId": "PROD_EASY",
                  "productAmt": orderPop.product.price,
                  "productPaymentAmt": orderPop.product.price,
                  "sortOrdering": 1,
                  "productName": orderPop.product.name,
                  "orderQuantity": 1,
                  "sellerOrderProductReferenceKey": order._id,
                  //"productImageUrl": "http://dailyboom.co/uploads/"+order.product.images[0]
                }
            ]
          };
          request.post(
              'https://alpha-api-bill.payco.com/outseller/order/reserve',
              { json: payco },
              function (error, response, body) {
                  console.log(body)
                  if (!error && body.code == 0) {
                      res.render('checkout', { order: orderPop, orderSheetUrl: body.result.orderSheetUrl });
                  }
              }
          );   
        })
      }
      else
        res.redirect('/shipping');
    });
  }
  else {
    Order.findOne({ '_id': req.session.order }, function(err, order) {
      if ((req.user && hasShipping(req.user)) || (hasShipping(order))) {
        order.populate('product', function(err, orderPop) {
          var payco = {
            "sellerKey": "S0FSJE",
            "sellerOrderReferenceKey": order._id,
            "totalOrderAmt": orderPop.product.price,
            "totalDeliveryFeeAmt": 0,
            "totalPaymentAmt": orderPop.product.price,
            "serviceUrl": "http://dailyboom.co/success",
            "serviceUrlParam" : "{\"order_id\":\""+order._id+"\",\"returnUrlParam2\":300}",            
            "returnUrl": "http://dailyboom.co/success",
            "returnUrlParam" : "{\"order_id\":\""+order._id+"\",\"returnUrlParam2\":300}",
            "orderMethod": "EASYPAY_F",
            "orderProducts": [
                {
                  "cpId": "PARTNERTEST",
                  "productId": "PROD_EASY",
                  "productAmt": orderPop.product.price,
                  "productPaymentAmt": orderPop.product.price,
                  "sortOrdering": 1,
                  "productName": orderPop.product.name,
                  "orderQuantity": 1,
                  "sellerOrderProductReferenceKey": order._id,
                  //"productImageUrl": "http://dailyboom.co/uploads/"+order.product.images[0]
                }
            ]
          };
          request.post(
              'https://alpha-api-bill.payco.com/outseller/order/reserve',
              { json: payco },
              function (error, response, body) {
                  console.log(body)
                  if (!error && body.code == 0) {
                      res.render('checkout', { order: orderPop, orderSheetUrl: body.result.orderSheetUrl });
                  }
              }
          ); 
        })
      }
      else
        res.redirect('/shipping');
    });
  }
});

router.get('/success', function(req, res) {
  console.log(req.query);
  res.render('success');
});

router.get('/shipping', function(req, res) {
  if (!req.session.order)
    res.redirect('/');
  else
    res.render('shipping');
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
        required: true,
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
          .validate('agree-terms-2', i18n.__('user.agreeTerms2'), {
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
                  res.render('shipping', { errors: err });
                }
                else {
                  order.user = user.id;
                  order.save(function(err) {
                    transporter.sendMail({
                      from: 'DailyBoom <contact@dailyboom.co>',
                      to: user.email,
                      subject: 'Welcome to DailyBoom',
                      text: 'Thank you for registering on DailyBoom!'
                    }, function (err, info) {
                        if (err) { console.log(err); res.render('shipping', { error: err.errmsg }); }
                        console.log('Message sent: ' + info.response);
                        transporter.close();
                        req.login(user, function(err) {
                          if (err) {
                            console.log(err);
                          }
                          return res.redirect('/checkout');
                        });
                    });
                  });
                }
              });
            }
          });
      }
      else if (req.user) {
        req.Validator.getErrors(function(errors){
          if (errors.length > 0) {
            res.render('shipping', { errors: errors });
          }
          else {
            var user = req.user;
            
            user.shipping = {
              full_name: req.body.full_name,
              address: req.body.address1,
              country: req.body.country,
              zipcode: req.body.zipcode,
              phone_number: req.body.phone_number
            }
            user.save(function(err) {
              if (err) {
                res.render('shipping', { errors: err });
              }
              else {
                order.user = user.id;
                order.save(function(err) {
                  if (err) {
                    res.render('shipping', { errors: err });
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
            res.render('shipping', { errors: errors });
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
                res.render('shipping', { errors: err });
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

module.exports = router;