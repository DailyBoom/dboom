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
var i18n = require('i18n');
var config = require('config-heroku');
var slack = require('slack-notify')(config.Slack.webhookUrl);
var extend = require('util')._extend;
var request = require("request");
var CSVTransform = require('csv-transform');
var accounting = require('accounting');
var paginate = require('express-paginate');
require('mongoose-pagination');

var transporter = nodemailer.createTransport(smtpTransport({
    host: config.Nodemailer.host,
    auth: {
        user: config.Nodemailer.auth.user,
        pass: config.Nodemailer.auth.pass
    }
}));

// As with any middleware it is quintessential to call next()
// if the user is authenticated
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

var hasShipping = function(obj) {
  if (!obj.shipping)
    return false;
  if (obj.shipping.full_name && obj.shipping.phone_number && obj.shipping.address && obj.email && obj.shipping.city)
    return true;
  return false;
}

var getOrderTotal = function(order) {
  order.totalOrderAmt = order.product.price * order.quantity + order.product.delivery_price;
  console.log(order.quantity);
  console.log(order.product.delivery_price);
  console.log(order.product.price);
  if (order.coupon) {
    if (order.coupon.type == 1)
      order.totalOrderAmt -= order.product.delivery_price;
    else if (order.coupon.type == 2)
      order.totalOrderAmt -= order.coupon.price;
    else if (order.coupon.type == 3)
      order.totalOrderAmt -= order.totalOrderAmt * (order.coupon.percentage / 100);
  }
  if (order.user && order.wallet_dc && order.wallet_dc <= order.user.wallet) {
      order.totalOrderAmt -= order.wallet_dc;    
  }
}

var getOrderCartTotal = function(order) {
  order.totalOrderAmt = 0;
  order.cart.forEach(function(item) {
    order.totalOrderAmt += item.product.price * item.quantity;
  });
  if (order.totalOrderAmt < 50000)
     order.totalOrderAmt += 2500;
};

var reservePayco = function(order) {
  var payco = {
    "sellerKey": config.Payco.sellerKey,
    "sellerOrderReferenceKey": order._id,
    "totalDeliveryFeeAmt": 0,
    "totalPaymentAmt": order.totalOrderAmt,
    "returnUrl": config.Payco.returnUrl,
    "returnUrlParam" : "{\"order_id\":\""+order._id+"\"}",
    "orderMethod": "EASYPAY",
    "payMode": "PAY2",
    "orderProducts": [
        {
          "cpId": config.Payco.cpId,
          "productId": config.Payco.productId,
          "productAmt": order.totalOrderAmt,
          "productPaymentAmt": order.totalOrderAmt,
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

var reserveCartPayco = function(order) {
  var payco = {
    "sellerKey": config.Payco.sellerKey,
    "sellerOrderReferenceKey": order._id,
    "totalDeliveryFeeAmt": order.totalOrderAmt < 50000 ? 2500 : 0,
    "totalPaymentAmt": order.totalOrderAmt,
    "returnUrl": config.Payco.returnMallUrl,
    "returnUrlParam" : "{\"order_id\":\""+order._id+"\"}",
    "orderMethod": "EASYPAY",
    "payMode": "PAY2",
    "orderProducts": []
  };

  order.cart.forEach(function(item) {
    payco.orderProducts.push({
      "cpId": config.Payco.cpId,
      "productId": config.Payco.productId,
      "productAmt": item.product.price * item.quantity,
      "productPaymentAmt": item.product.price *item.quantity,
      "sortOrdering": 1,
      "productName": item.product.name+"("+item.product.options[item.option].name+")",
      "orderQuantity": item.quantity,
      "sellerOrderProductReferenceKey": order._id,
      "productImageUrl": "http://dailyboom.co/"+item.product.images[0]
    });
  });
  
  if (order.totalOrderAmt < 50000) {
    payco.orderProducts.push({
      "cpId": config.Payco.cpId,
      "productId": config.Payco.productId,
      "productAmt": 2500,
      "productPaymentAmt": 2500,
      "sortOrdering": 1,
      "productName": "delivery fee",
      "orderQuantity": 1,
      "sellerOrderProductReferenceKey": order._id
    });
  }
  console.log(payco);
  return payco;
};

router.get('/orders/success', isAdmin, function(req, res) {
  res.render('mailer/buy_success');
});

router.get('/orders/shipped', isAdmin, function(req, res) {
  res.render('mailer/shipped');
});

router.get('/merchants/orders/list', isMerchant, function(req, res) {
  var page = req.query.page ? req.query.page : 1;
  var query = Order.find({ status: { $in: ["Paid", "Sent"]}, $or: [ { cart_merchants: req.user.id }, { merchant_id: req.user.id }] }, {}, { sort: { 'created_at': -1 } }).populate('product');
  if (req.query.order_date)
    query.where('created_at').gte(req.query.order_date).lt(moment(req.query.order_date).add(1, 'days'));
  query.paginate(page, 10, function(err, orders, total) {
    res.render('orders/list', { orders: orders, pages: paginate.getArrayPages(req)(3, Math.ceil(total / 10), page), currentPage: page, date: req.query.order_date ? req.query.order_date : '' });
  });
});

router.get('/orders/list', isAdmin, function(req, res) {
  var page = req.query.page ? req.query.page : 1;
  var query = Order.find({}, {}, { sort: { 'created_at': -1 } }).populate('product');
  if (req.query.order_date)
    query.where('created_at').gte(req.query.order_date).lt(moment(req.query.order_date).add(1, 'days'));
  if (req.query.status)
    query.where('status').equals(req.query.status);
  query.paginate(page, 10, function(err, orders, total) {
    res.render('orders/list', { orders: orders, pages: paginate.getArrayPages(req)(3, Math.ceil(total / 10), page), currentPage: page, date: req.query.order_date ? req.query.order_date : '' });
  });
});

router.get('/orders/view/:id', isMerchantOrAdmin, function(req, res) {
  Order.findOne({ _id: req.params.id }).populate('product user cart.product').exec(function(err, order) {
    if (err)
      console.log(err);
    if (!order)
      res.redirect('/');
    Comment.find({ order: order._id }, function(err, comments) {
      res.render('orders/view', { order: order, comments: comments });
    });
  });
});

router.get('/orders/edit/:id', isAdmin, function(req, res) {
  Order.findOne({ _id: req.params.id }).populate('user').exec(function(err, order) {
    if (err)
      console.log(err);
    if (!order)
      return res.redirect('/orders/list');
    res.render('orders/edit', { order: order });
  });
});

router.post('/orders/edit/:id', isAdmin, function(req, res) {
  Order.findOne({ _id: req.params.id }).exec(function(err, order) {
    order.shipping.full_name = req.body.full_name;
    order.shipping.phone_number = req.body.phone_number;
    order.shipping.address = req.body.address;
    order.shipping.zipcode = req.body.zipcode;
    order.shipping.country = req.body.country;
    
    order.save(function() {
      res.redirect('/orders/view/'+order.id);
    });
  });
});

router.get('/orders/delete/:id', isAdmin, function(req, res) {
  Order.findOneAndRemove({ _id: req.params.id }, function(err, order) {
    if (err)
      console.log(err);
    res.redirect('/orders/list');
  });
});

router.post('/add_to_cart', function(req, res) {
  Product.findOne({_id: req.body.product_id, is_published: true, extend: 4}, function(err, product) {
    console.log(req.body);
    if (err)
      console.log(err);
    if (!product)
      res.status(500).json({ error: "Product is invalid" });
    if (req.body.quantity > product.options[req.body.option].quantity)
      res.status(500).json({ error: "Quantity is invalid" });      
    if (!req.session.cart_order) {
      var order = new Order({
        cart_merchants: [product.merchant_id],
        cart: [{ product: product._id, quantity: req.body.quantity, option: req.body.option }],
        status: "Submitted"
      });
      if (req.user) {
        order.user = req.user;
      }
      order.save(function(err) {
        req.session.cart_order = order._id;
        return res.status(200).json({ success: true, message: "Product added" });
      });
    }
    else {
      Order.findOne({ _id: req.session.cart_order }, function(err, order) {
        if (err) {
          console.log(err);          
          return res.status(500).json({ error: "Error with order" });          
        }
        order.cart_merchants.push(product.merchant_id);
        order.cart.push({ product: product._id, quantity: req.body.quantity, option: req.body.option });
        order.save(function(err) {
          return res.status(200).json({ success: true, message: "Product added" });
        });
      });
    }
  });
});

router.get('/mall/checkout', function(req, res) {
  if (typeof req.session.cart_order === 'undefined' || !req.session.cart_order) {
    return res.redirect('/mall');
  }
  else {
    if (req.query.no_login && req.query.no_login == 1) {
        console.log(req.query.no_login);
        req.session.no_login = true;
    }
    if (!req.user && !req.session.no_login) {
        return res.redirect('/mall/login');
    }
    Order.findOne({ _id: req.session.cart_order }).populate('cart.product').exec(function(err, order) {
      if (err)
        console.log(err);
      if ((req.user && hasShipping(req.user)) || (hasShipping(order))) {
        getOrderCartTotal(order);
        order.save(function(err) {
          var payco = reserveCartPayco(order);
          request.post(
            config.Payco.host+'/outseller/order/reserve',
            { json: payco },
            function (error, response, body) {
              console.log(body)
              if (!error && body.code == 0) {
                if (req.user) {
                  Coupon.find({ user: req.user.id, expires_at: { $gte: moment().format("MM/DD/YYYY") }, used: false }, function(err, coupons) {
                    res.render('mall/checkout', { order: order, title: req.__('payment'), coupons: coupons });
                  });
                }
                else
                  res.render('mall/checkout', { order: order, title: req.__('payment') });
              }
              else
                res.redirect('/mall');
            }
          );
        });
      }
      else {
        res.redirect('/shipping');
      }
    });
  }
});

router.post('/mall/update_cart', function(req, res) {
  if (typeof req.session.cart_order === 'undefined' || !req.session.cart_order) {
    return res.status(500).json({});
  }
  else {
    Order.findOne({ _id: req.session.cart_order }).populate('cart.product').exec(function(err, order) {
      if (err)
        console.log(err);
      order.cart[req.body.index].quantity = req.body.quantity;
      order.markModified('cart');
      order.save(function(err) {
        if (err)
          console.log(err);
        return res.status(200).json({});
      });
    });
  }
});

router.post('/mall/remove_from_cart', function(req, res) {
  if (typeof req.session.cart_order === 'undefined' || !req.session.cart_order) {
    return res.status(500).json({});
  }
  else {
    Order.findOne({ _id: req.session.cart_order }).populate('cart.product').exec(function(err, order) {
      if (err)
        console.log(err);
      order.cart.splice(req.body.index, 1);
      order.markModified('cart');
      order.save(function(err) {
        if (err)
          console.log(err);
        return res.status(200).json({});
      });
    });
  }
});


router.get('/checkout', function(req, res) {
  if (!req.query.product_id && !req.session.product && !req.session.order)
    return res.redirect('/');
  if (req.session.product && req.query.product_id && (req.session.product != req.query.product_id)) {
    delete req.session.order;
    delete req.session.product;
  }
  
  var date = moment().startOf('isoweek').format("MM/DD/YYYY");
  Product.findOne({_id: req.query.product_id ? req.query.product_id : req.session.product, is_published: true}, function(err, product) {
    if (err)
      console.log(err);
    if (!product)
      return res.redirect('/');
    if (typeof req.session.order === 'undefined' || !req.session.order) {
      var order = new Order({
        product: product.id,
        status: "Submitted",
      });
  
      if (req.user) {
        order.user = req.user.id;
        if (req.user.shipping)
          order.shipping = req.user.shipping;
      }
  
      order.save(function(err) {
        if (err)
          return res.redirect("/");
        req.session.order = order.id;
        if (!req.session.product)
          req.session.product = req.query.product_id;
          order.populate('product coupon', function(err, orderPop) {
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
            getOrderTotal(order);
            orderPop.save(function(err) {
              if ((req.user && hasShipping(req.user)) || (hasShipping(order))) {
                var leftQuantity;
                orderPop.product.options.forEach(function(option){
                  if (option.name === orderPop.option) {
                    leftQuantity = parseInt(option.quantity);
                  }
                });
                if (req.user) {
                  Coupon.find({ user: req.user.id, expires_at: { $gte: moment().format("MM/DD/YYYY") }, used: false }, function(err, coupons) {
                    res.render('checkout', { order: orderPop, leftQuantity: leftQuantity, title: req.__('payment'), coupons: coupons });
                  });
                }
                else
                  res.render('checkout', { order: orderPop, leftQuantity: leftQuantity, title: req.__('payment') });
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
          order.populate('product coupon', function(err, orderPop) {
            if (!req.session.product)
              req.session.product = orderPop.product.id;
            getOrderTotal(order);
            var leftQuantity;
            orderPop.product.options.forEach(function(option){
              if (option.name === orderPop.option)
                leftQuantity = parseInt(option.quantity);
            });
            if (req.user) {
              Coupon.find({ user: req.user.id, expires_at: { $gte: moment().format("MM/DD/YYYY") }, used: false }, function(err, coupons) {
                res.render('checkout', { order: orderPop, leftQuantity: leftQuantity, title: req.__('payment'), coupons: coupons });
              });
            }
            else
              res.render('checkout', { order: orderPop, leftQuantity: leftQuantity, title: req.__('payment') });
          });
        }
        else
          res.redirect('/shipping');
      });
    }
  });
});

router.post('/checkout', function(req, res) {
  if (req.session.order) {
    Order.findOne({ '_id': req.session.order }).populate('product user').exec(function(err, order) {
        if (err)
          console.log(err);
        order.option = req.body.order_option;
        order.quantity = parseInt(req.body.order_quantity);
        order.totalOrderAmt = order.product.price * order.quantity + order.product.delivery_price;
        if (req.body.coupon)
          order.coupon = req.body.coupon;
        if (req.body.wallet_dc && req.body.wallet_dc <= req.user.wallet && req.body.wallet_dc > 0)
          order.wallet_dc = req.body.wallet_dc;
        order.save(function(err) {
          if (!req.session.product)
            req.session.product = order.product.id;
          order.populate('coupon', function(err, order) {
            getOrderTotal(order);
            var leftQuantity;
            order.product.options.forEach(function(option){
              if (option.name === order.option)
                leftQuantity = parseInt(option.quantity);
            });
            if (req.user) {
              Coupon.find({ user: req.user.id, expires_at: { $gte: moment().format("MM/DD/YYYY") }, used: false }, function(err, coupons) {
                res.render('checkout', { order: order, leftQuantity: leftQuantity, title: req.__('payment'), coupons: coupons });
              });
            }
            else
              res.render('checkout', { order: order, leftQuantity: leftQuantity, title: req.__('payment') });
        });
      });
    });
  }
  else {
    res.redirect('/');
  }
});

router.post('/deposit_checkout', function(req, res) {
  if (req.session.order) {
    Order.findOne({ '_id': req.session.order || req.session.cart_order }).populate('product coupon user').exec(function(err, order) {
        if (order.status == "Waiting")
          return res.redirect('/success');
        if (err)
          console.log(err);
        order.status = "Waiting";
        order.deposit_name = req.body.deposit_name;
        order.created_at = Date.now();
        if (req.user)
          order.shipping = req.user.shipping;
        getOrderTotal(order);
        if (order.coupon) {
          order.coupon.used = true;
          order.coupon.save();
        }
        if (order.user && order.wallet_dc) {
          order.user.wallet -= order.wallet_dc;
          order.user.save();
        }
        order.save(function(err) {
          if (err)
            console.log(err);

          fs.readFile('./views/mailer/bank_deposit.vash', "utf8", function(err, file) {
            if(err){
              //handle errors
              console.log('ERROR!');
              return res.send('ERROR!');
            }
            var html = vash.compile(file);
            console.log(order.user ? order.user.email : order.email);
            moment.locale('vi');
            transporter.sendMail({
              from: 'Yppuna <hello@yppuna.vn>',
              to: order.user ? order.user.email : order.email,
              subject: 'Cảm ơn quý vị đã đặt hàng tại Yppuna.',
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

router.all('/payco_callback', function (req, res) {
  var resp;
  if (req.query.code) {
    resp = req.query;
  }
  else {
    resp = req.body;
  }
  console.log(resp);
  if (resp.code == 0) {
    var payco = {
      "sellerKey": config.Payco.sellerKey,
      "reserveOrderNo": resp.reserveOrderNo,
      "sellerOrderReferenceKey": resp.sellerOrderReferenceKey,
      "paymentCertifyToken": resp.paymentCertifyToken,
      "totalPaymentAmt": resp.totalPaymentAmt
    }
    request.post(
      config.Payco.host + '/outseller/payment/approval',
      { json: payco },
      function (error, response, body) {
        console.log(body)
        if (!error && body.code == 0) {
          Order.findOne({ _id: resp.order_id }).populate('user product coupon').exec(function (err, order) {
            if (req.user)
              order.shipping = req.user.shipping;
            order.payco.orderNo = body.result.orderNo;
            order.payco.sellerOrderReferenceKey = body.result.sellerOrderReferenceKey;
            order.payco.orderCertifyKey = body.result.orderCertifyKey;
            order.payco.totalOrderAmt = body.result.totalOrderAmt;
            order.payco.paymentDetails = body.result.paymentDetails;
            order.merchant_id = order.product.merchant_id;
            order.created_at = Date.now();
            order.status = "Paid";
            if (order.coupon) {
              order.coupon.used = true;
              order.coupon.save();
            }
            if (order.user && order.wallet_dc) {
              order.user.wallet -= order.wallet_dc;
              order.user.save();
            }
            order.save(function (err) {
              Product.findOne({ _id: order.product.id }, function (err, product) {
                product.options.forEach(function (option) {
                  if (option.name === order.option)
                    option.quantity -= order.quantity;
                });
                product.markModified('options');
                product.save(function (err) {

                  fs.readFile('./views/mailer/buy_success.vash', "utf8", function (err, file) {
                    if (err) {
                      //handle errors
                      console.log('ERROR!');
                      return res.send('ERROR!');
                    }
                    var html = vash.compile(file);
                    transporter.sendMail({
                      from: 'Yppuna <hello@yppuna.vn>',
                      to: order.user ? order.user.email : order.email,
                      subject: '데일리 붐 구매 안내.',
                      html: html({ full_name: order.user ? order.user.shipping.full_name : order.shipping.full_name, i18n: i18n })
                    }, function (err, info) {
                      if (err) { console.log(err); }
                      //console.log('Message sent: ' + info.response);
                      transporter.close();
                      res.render('payco_callback', { code: resp.code });
                    });
                  });
                });
              });
            });
          });
        }
        else {
          res.render('payco_callback', { msg: body.message, code: resp.code });
        }
      }
      );
  }
  else {
    res.render('payco_callback', { msg: resp.message, code: resp.code });
  }
});

// Callback for payco on a mall checkout
router.all('/mall/payco_callback', function (req, res) {
  var resp;
  if (req.query.code) {
    resp = req.query;
  }
  else {
    resp = req.body;
  }
  console.log(resp);
  if (resp.code == 0) {
    var payco = {
      "sellerKey": config.Payco.sellerKey,
      "reserveOrderNo": resp.reserveOrderNo,
      "sellerOrderReferenceKey": resp.sellerOrderReferenceKey,
      "paymentCertifyToken": resp.paymentCertifyToken,
      "totalPaymentAmt": resp.totalPaymentAmt
    }
    request.post(
      config.Payco.host + '/outseller/payment/approval',
      { json: payco },
      function (error, response, body) {
        console.log(body)
        if (!error && body.code == 0) {
          Order.findOne({ _id: resp.order_id }).populate('user cart.product coupon').exec(function (err, order) {
            if (req.user)
              order.shipping = req.user.shipping;
            order.payco.orderNo = body.result.orderNo;
            order.payco.sellerOrderReferenceKey = body.result.sellerOrderReferenceKey;
            order.payco.orderCertifyKey = body.result.orderCertifyKey;
            order.payco.totalOrderAmt = body.result.totalOrderAmt;
            order.payco.paymentDetails = body.result.paymentDetails;
            order.merchant_id = order.product.merchant_id;
            order.status = "Paid";
            order.created_at = Date.now();
            if (order.coupon) {
              order.coupon.used = true;
              order.coupon.save();
            }
            order.save(function (err) {
              order.cart.forEach(function (item) {
                item.product.options[item.option].quantity -= item.quantity;
                item.product.markModified('options');
                item.product.save();
              });

              fs.readFile('./views/mailer/buy_success.vash', "utf8", function (err, file) {
                if (err) {
                  //handle errors
                  console.log('ERROR!');
                  return res.send('ERROR!');
                }
                var html = vash.compile(file);
                transporter.sendMail({
                  from: 'Yppuna <hello@yppuna.vn>',
                  to: order.user ? order.user.email : order.email,
                  subject: '데일리 붐 구매 안내.',
                  html: html({ full_name: order.user ? order.user.shipping.full_name : order.shipping.full_name, i18n: i18n })
                }, function (err, info) {
                  if (err) { console.log(err); }
                  //console.log('Message sent: ' + info.response);
                  transporter.close();
                  res.render('payco_callback', { code: resp.code });
                });
              });
            });
          });
        }
        else {
          res.render('payco_callback', { msg: body.message, code: resp.code });
        }
      }
      );
  }
  else {
    res.render('payco_callback', { msg: resp.message, code: resp.code });
  }
});

router.get('/success', function(req, res) {
  if (!req.session.order && !req.session.cart_order)
    return res.redirect('/');
  Order.findOne({_id: req.session.order || req.session.cart_order, status: {$in : ['Paid', 'Waiting']}}).populate('product cart.product user').exec(function(err, order) {
    if (err)
      console.log(err)
    if (!order)
      return res.redirect('/');
    delete req.session.order;
    delete req.session.cart_order;
    if (app.get("env") === "production") {
      slack.send({
        channel: '#new-order',
        icon_url: 'http://www.yppuna.vn/images/favicon/favicon-96x96.png',
        text: 'New order <http://www.yppuna.vn/orders/view/' + order._id + '>',
        unfurl_links: 1,
        username: 'Yppuna-bot'
      });
    }
    fs.readFile('./views/mailer/admin_buy_success.vash', "utf8", function(err, file) {
      if(err){
        //handle errors
        console.log('ERROR!');
        return res.send('ERROR!');
      }
      var html = vash.compile(file);
      moment.locale('vi');
      transporter.sendMail({
        from: 'Yppuna <hello@yppuna.vn>',
        to: "hello@yppuna.vn",
        subject: 'You received a new order',
        html: html({ order: order, moment: moment, i18n: i18n })
      }, function (err, info) {
          if (err) { console.log(err); }
          //console.log('Message sent: ' + info.response);
          transporter.close();
          res.render('success', { code: req.query.code, order: order, title: req.__('confirm'), description: "Cảm ơn quý vị đã đặt hàng tại Yppuna." });
      });
    });
  });
});

router.get('/orders/paid/:id', isAdmin, function(req, res) {
  Order.findOne({ '_id': req.params.id }).populate('product user coupon').exec(function(err, order) {
      if (err)
        console.log(err);
      if (!order)
        return res.redirect('/orders/list');
      if (order.status == "Paid") {
        return res.redirect('/orders/list');
      }
      order.merchant_id = order.product.merchant_id;
      order.status = "Paid";
      order.save(function(err) {
        if (err)
          console.log(err);
        Product.findOne({ _id: order.product }, function(err, product) {
          product.options.forEach(function(option){
            if (option.name === order.option) {
              option.quantity -= order.quantity;
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
                  moment.locale('vi');
                  transporter.sendMail({
                    from: 'Yppuna <hello@yppuna.vn>',
                    to: order.user ? order.user.email : order.email,
                    subject: '데일리 붐 구매 안내.',
                    html: html({ full_name : order.user ? order.user.shipping.full_name : order.shipping.full_name, moment: moment, i18n: i18n })
                  }, function (err, info) {
                      if (err) { console.log(err); }
                      //console.log('Message sent: ' + info.response);
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

// When a mall cart gets paid
router.get('/orders/cart_paid/:id', isAdmin, function(req, res) {
  Order.findOne({ '_id': req.params.id }).populate('cart.product user coupon').exec(function(err, order) {
      if (err)
        console.log(err);
      if (!order)
        return res.redirect('/mypage');
      order.merchant_id = order.product.merchant_id;
      order.status = "Paid";
      order.save(function(err) {
        if (err)
          console.log(err);
        order.cart.forEach(function(item){
          item.product.options[item.option].quantity -= item.quantity;          
          item.product.markModified('options');
          item.product.save();
        });
        fs.readFile('./views/mailer/buy_success.vash', "utf8", function(err, file) {
          if(err){
            //handle errors
            console.log('ERROR!');
            return res.send('ERROR!');
          }
          var html = vash.compile(file);
          moment.locale('vi');
          transporter.sendMail({
            from: 'Yppuna <hello@yppuna.vn>',
            to: order.user ? order.user.email : order.email,
            subject: '데일리 붐 구매 안내.',
            html: html({ full_name : order.user ? order.user.shipping.full_name : order.shipping.full_name, moment: moment })
          }, function (err, info) {
              if (err) { console.log(err); }
              //console.log('Message sent: ' + info.response);
              transporter.close();
              res.redirect('/orders/list');
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
      return res.redirect('/orders/list');
    order.status = "Sent";
    order.save(function(err) {
      fs.readFile('./views/mailer/shipped.vash', "utf8", function(err, file) {
        if(err){
          //handle errors
          console.log('ERROR!');
          return res.send('ERROR!');
        }
        var html = vash.compile(file);
        moment.locale('vi');
        transporter.sendMail({
          from: 'Yppuna <hello@yppuna.vn>',
          to: order.user ? order.user.email : order.email,
          subject: '데일리 붐 배송 안내.',
          html: html({ moment: moment, order: order, accounting: accounting })
        }, function (err, info) {
            if (err) { console.log(err); }
            //console.log('Message sent: ' + info.response);
            transporter.close();
            res.redirect('/orders/list');
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
      return res.redirect('/mypage');
    var payco = {
      "sellerKey" : config.Payco.sellerKey,
      "orderNo" : order.payco.orderNo,
      "sellerOrderReferenceKey": order.payco.sellerOrderReferenceKey,
      "orderCertifyKey" : order.payco.orderCertifyKey,
      "cancelTotalAmt": order.payco.totalOrderAmt
    };
    request.post(
      config.Payco.host+'/outseller/order/cancel',
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

                fs.readFile('./views/mailer/order_cancelled.vash', "utf8", function(err, file) {
                  if(err){
                    //handle errors
                    console.log('ERROR!');
                    return res.send('ERROR!');
                  }
                  var html = vash.compile(file);
                  moment.locale('vi');
                  transporter.sendMail({
                    from: 'Yppuna <hello@yppuna.vn>',
                    to: order.user ? order.user.email : order.email,
                    subject: '데일리 붐 주문 취소 안내',
                    html: html({ moment: moment, order: order, accounting: accounting })
                  }, function (err, info) {
                      if (err) { console.log(err);}
                      //console.log('Message sent: ' + info.response);
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
    if (order.status == "Cancelled") {
      return res.redirect('/mypage');
    }
    if (err)
      console.log(err);
    if (!order)
      return res.redirect('/mypage');
    order.status = "Cancelled";
    order.save(function(err) {
      if (err)
        console.log(err);

      fs.readFile('./views/mailer/order_cancelled.vash', "utf8", function(err, file) {
        if(err){
          //handle errors
          console.log('ERROR!');
          return res.send('ERROR!');
        }
        var html = vash.compile(file);
        moment.locale('vi');
        transporter.sendMail({
          from: 'Yppuna <hello@yppuna.vn>',
          to: order.user ? order.user.email : order.email,
          subject: '데일리 붐 주문 취소 안내',
          html: html({ moment: moment, order: order, accounting: accounting })
        }, function (err, info) {
            if (err) { console.log(err);}
            //console.log('Message sent: ' + info.response);
            transporter.close();
            res.redirect('/mypage');
        });
      });
    });
  });
});

router.get('/shipping', function(req, res) {
  if (!req.session.order && !req.session.cart_order)
    res.redirect('/');
  else
    Order.findOne({ '_id': req.session.order || req.session.cart_order }, function(err, order) {
      res.render('shipping', { title: req.__('shipping'), order: order });
    });
});

router.post('/shipping', function(req, res) {
  if (!req.session.order && !req.session.cart_order)
    return res.redirect('/');
  Order.findOne({ '_id': req.session.order || req.session.cart_order }, function(err, order) {
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
      .validate('city', i18n.__('user.city'), {
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
              res.render('shipping', { errors: errors, order: order });
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
                  city: req.body.city,
                  zipcode: req.body.zipcode,
                  phone_number: req.body.phone_number
                },
                wallet: 100
              });
              user.save(function(err) {
                if (err) {
                  console.log(err);
                  var errors = [];
                  for (var path in err.errors) {
                    errors.push(i18n.__("unique", i18n.__("user."+path)));
                  }
                  res.render('shipping', { errors: errors, title: req.__('shipping'), order: order });
                }
                else {
                  order.user = user.id;
                  order.shipping = JSON.parse(JSON.stringify(user.shipping));
                  order.save(function(err) {
                    fs.readFile('./views/mailer/signup.vash', "utf8", function(err, file) {
                      if(err){
                        //handle errors
                        console.log('ERROR!');
                        return res.send('ERROR!');
                      }
                      var html = vash.compile(file);
                      transporter.sendMail({
                        from: 'Yppuna <hello@yppuna.vn>',
                        to: user.email,
                        subject: user.username+'님 회원가입을 축하드립니다.',
                        html: html({ user : user, i18n: i18n })
                      }, function (err, info) {
                          if (err) { console.log(err); }
                          //console.log('Message sent: ' + info.response);
                          req.login(user, function(err) {
                            if (err) {
                              console.log(err);
                            }
                            if (req.session.cart_order)
                              return res.redirect('/mall/checkout')
                            else
                              return res.redirect('/checkout');
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
            res.render('shipping', { errors: errors, title: req.__('shipping'), order: order });
          }
          else {
             User.findOne({ _id: req.user._id }, {}, function(err, user) {
              if (!req.user.email) {
                user.email = req.body.email;
              }
              user.shipping = {
                full_name: req.body.full_name,
                address: req.body.address1,
                country: req.body.country,
                city: req.body.city,
                zipcode: req.body.zipcode,
                phone_number: req.body.phone_number
              };
              user.save(function(err) {
                if (err) {
                    console.log(err);
                    var errors = [];
                    for (var path in err.errors) {
                      errors.push(i18n.__("unique", i18n.__("user."+path)));
                    }
                  res.render('shipping', { errors: errors, title: req.__('shipping'), order: order });
                }
                else {
                  order.user = user.id;
                  order.shipping = JSON.parse(JSON.stringify(user.shipping));
                  order.save(function(err) {
                    if (err) {
                      res.render('shipping', { errors: err, title: req.__('shipping'), order: order });
                    }
                    else {
                      if (req.session.cart_order)
                        return res.redirect('/mall/checkout')
                      else
                        return res.redirect('/checkout');
                    }
                  });
                }
              });
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
            res.render('shipping', { errors: errors, title: req.__('shipping'), order: order });
          }
          else {
            order.shipping = {
                full_name: req.body.full_name,
                address: req.body.address1,
                country: req.body.country,
                city: req.body.city,
                zipcode: req.body.zipcode,
                phone_number: req.body.phone_number
            }
            order.email = req.body.email;
            order.save(function(err) {
              if (err) {
                res.render('shipping', { errors: err, title: req.__('shipping'), order: order });
              }
              else {
                if (req.session.cart_order)
                  return res.redirect('/mall/checkout')
                else
                  return res.redirect('/checkout');
              }
            });
          }
        });
      }
  });
});

//order export

router.get('/orders/export', isAdmin, function(req, res) {
  res.setHeader('Content-disposition', 'attachment; filename=orders_'+moment().format("YYYYMMDDHHmmss")+'.csv'); 
  res.set('Content-Type', 'text/csv; charset=utf-8'); 
  res.write(new Buffer('EFBBBF', 'hex'));
  res.status(200);
  var query = Order.find({status: "Sent"}, {}, {sort: {created_at: -1}}).populate('user product');
  if (req.query.date)
    query.where('created_at').gte(req.query.date).lt(moment(req.query.date).add(1, 'days'));
  query.stream().pipe(Order.csvTransformStream()).pipe(res);
});

router.get('/orders/merchants/export', isMerchant, function(req, res) {
  res.setHeader('Content-disposition', 'attachment; filename=orders_'+moment().format("YYYYMMDDHHmmss")+'.csv'); 
  res.set('Content-Type', 'text/csv; charset=utf-8'); 
  res.write(new Buffer('EFBBBF', 'hex'));
  res.status(200);
  var query = Order.find({status: "Sent", merchant_id: req.user.id}, {}, {sort: {created_at: -1}}).populate('user product');
  if (req.query.date)
    query.where('created_at').gte(req.query.date).lt(moment(req.query.date).add(1, 'days'));
  query.stream().pipe(Order.csvTransformStream()).pipe(res);
});

module.exports = router;