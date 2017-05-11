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
    service: 'gmail',
    auth: {
        user: config.Nodemailer.auth.user,
        pass: config.Nodemailer.auth.pass
    }
}));

function isEmptyObject(obj) {
  return !Object.keys(obj).length;
}

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
  if (obj.shipping.full_name && obj.shipping.phone_number && obj.shipping.address && obj.shipping.city && obj.shipping.city == "KHÁC") // When user the Other City option
    return true;
  if (obj.shipping.full_name && obj.shipping.phone_number && obj.shipping.address && obj.shipping.city && obj.shipping.district && obj.shipping.ward)
    return true;
  return false;
}

var getOrderTotal = function(order) {
  order.totalOrderAmt = order.product.price * order.quantity + order.product.delivery_price;
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
  order.shipping_cost = 0;
  order.cart.forEach(function(item) {
    order.totalOrderAmt += item.product.price * item.quantity;
  });

  if (order.totalOrderAmt >= 200000) {
    order.shipping_cost = 0;
  }
  else if (order.shipping.city.toUpperCase() == "KHÁC") {
    order.shipping_cost = 30000;
  }
  else {
    order.shipping_cost = 20000;    
  }
  if (order.coupon && order.coupon.type == 2) {
    order.discount = order.shipping_cost;
  }
  else if (order.coupon && order.coupon.type == 2) {
    order.totalOrderAmt -= order.coupon.price;
    order.discount = order.coupon.price;
  }
  else if (order.coupon && order.coupon.type == 3) {
    order.discount = order.totalOrderAmt * (order.coupon.percentage / 100);
    order.totalOrderAmt -= order.discount;
  }
  if (!order.coupon || order.coupon && order.coupon.type != 1) {
    order.totalOrderAmt += order.shipping_cost;
  }
};

var getOrderCartRecap = function(order) {
  order.totalOrderAmt = 0;
  order.cart.forEach(function(item) {
    if (order.type == "wholesale") {
      if (order.shipping.country == 'vi-VN')
        order.totalOrderAmt += item.product.wholesale_price * item.quantity;
      else if (order.shipping.country == 'eu-ES')
        order.totalOrderAmt += parseFloat(item.product.w_eu_price) * item.quantity;
      else if (order.shipping.country == 'cs-CZ')
        order.totalOrderAmt += item.product.w_cz_price * item.quantity;
    }
    else
      order.totalOrderAmt += item.product.price * item.quantity;
  });
  if (order.coupon && order.coupon.type == 2) {
    order.totalOrderAmt -= order.coupon.price;
    order.discount = order.coupon.price;
  }
  else if (order.coupon && order.coupon.type == 3) {
    order.discount = order.totalOrderAmt * (order.coupon.percentage / 100);
    order.totalOrderAmt -= order.totalOrderAmt * (order.coupon.percentage / 100);
  }
};

router.post('/orders/apply_code', function(req, res) {
  Coupon.findOne({ code: req.body.code, expires_at: { $gt: moment() } }, function(err, coupon) {
    if (!coupon) {
      return res.redirect('/cart');
    }
    Order.findOne({ _id: req.session.cart_order }, function(err, order) {
      order.coupon = coupon.id;
      order.save(function(err) {
        return res.redirect('/cart');
      });
    });    
  });
});

router.get('/orders/list', isAdmin, function(req, res) {
  var page = req.query.page ? req.query.page : 1;
  var query = {};
    if (req.query.s_date)
    query['created_at'] = { '$gte': req.query.s_date, '$lt': moment(req.query.s_date).add(1, 'days') };
  if (req.query.s_status)
    query['status'] = req.query.s_status;
  if (req.query.s_quantity)
    query['cart.quantity'] = req.query.s_quantity;
  if (req.query.s_type)
    query['pay_method'] = req.query.s_type;
  if (req.query.s_id)
    query['_id'] = req.query.s_id;
  if (req.query.s_name) {
    query['shipping.full_name'] = { $regex: req.query.s_name, $options: "i" };
  }
  var option = { page: page, limit: 10, sort: { 'created_at': -1 }, populate: 'populate' };
  Order.paginate(query, option).then(function(result) {
    res.render('orders/list', { orders: result.docs, pages: paginate.getArrayPages(req)(3, Math.ceil(result.total / 10), page), currentPage: page, date: req.query.order_date ? req.query.order_date : '' });
  });
});

router.get('/orders/shipping', isAdmin, function(req, res) {
  var page = req.query.page ? req.query.page : 1;
  var query = { status: { $in: ["Waiting", "Paid"] } };
  var option = { sort: { 'created_at': -1 } , populate: 'product' };
  if (req.query.s_date)
    query['created_at'] = { '$gte': req.query.s_date, '$lt': moment(req.query.s_date).add(1, 'days') };
  if (req.query.s_status)
    query['status'] = req.query.s_status;
  if (req.query.s_quantity)
    query['cart.quantity'] = req.query.s_quantity;
  if (req.query.s_type)
    query['pay_method'] = req.query.s_type;
  if (req.query.s_id)
    query['_id'] = req.query.s_id;
  if (req.query.s_name) {
    query['shipping.full_name'] = { $regex: req.query.s_name, $options: "i" };
  }
  Order.paginate(query, option).then(function(result) {
    res.render('orders/list', { orders: result.docs, pages: paginate.getArrayPages(req)(3, Math.ceil(result.total / 10), page), currentPage: page, date: req.query.order_date ? req.query.order_date : '', shipping: true });
  });
});



router.get('/wholesalers/orders', isMerchantOrAdmin, function(req, res) {
  var page = req.query.page ? req.query.page : 1;
  var query = { type: 'wholesale' };
  if (req.query.order_date)
    query['created_at'] = { '$gte': req.query.order_date, '$lt': moment(req.query.order_date).add(1, 'days') };
  if (req.query.status)
    query['status'] = req.query.status;
  var option = { page: page, limit: 10, sort: { 'created_at': -1 }, populate: 'populate' };
  Order.paginate(query, option).then(function(result) {
    res.render('orders/list', { orders: result.docs, pages: paginate.getArrayPages(req)(3, Math.ceil(result.total / 10), page), currentPage: page, date: req.query.order_date ? req.query.order_date : '', wholesaler: true });
  });
});

router.get('/wholesalers/orders/new', isMerchantOrAdmin, function(req, res) {
  User.find({ role: 'wholesaler' }, function(err, users) {
    res.render('admin/wholesale_order', { users: users });
  });
});

router.post('/wholesalers/orders/new', isMerchantOrAdmin, function(req, res) {
  var order = new Order({
    cart: req.body.products,
    user: req.body.username,
    status: "Waiting",
    type: "wholesale"
  });
  order.populate('cart.product user', function(err) {
    order.shipping = JSON.parse(JSON.stringify(order.user.shipping));
    order.shipping.full_name = order.user.username;
    getOrderCartRecap(order);
    if (req.body.discount && parseInt(req.body.discount) > 0) {
      order.discount = order.totalOrderAmt * (parseInt(req.body.discount) / 100);
      order.totalOrderAmt -= order.discount; 
    }
    order.save(function(err) {
      order.cart.forEach(function(item) {
        item.product.options[item.option].quantity -= item.quantity;
        item.product.markModified('options');
        item.product.save();
      });
      return res.redirect('/wholesalers/orders');
    });
  });
});

router.post('/orders/view/:id', isMerchantOrAdmin, function(req, res) {
  Order.findOne({ _id: req.params.id }, function(err, order) {
    order.notes = req.body.notes;
    order.save(function(err) {
      res.redirect('back');
    });
  });
});

router.get('/orders/new', isAdmin, function(req, res) {
  res.render('orders/new');
});

router.post('/orders/new', isAdmin, function(req, res) {
  var order = new Order({
    shipping : {
      full_name: req.body.full_name,
      phone_number: req.body.phone,
      address: req.body.address
    },
    email: req.body.email,
    status: req.body.status,
    pay_method: req.body.pay_method,
    created_at: req.body.created_at,
    notes: req.body.notes,
    cart: req.body.products
  });

  order.save(function(err) {

    return res.redirect('/orders/list');
  });
});


router.get('/orders/view/:id', isMerchantOrAdmin, function(req, res) {
  Order.findOne({ _id: req.params.id }).populate('product user cart.product coupon').exec(function(err, order) {
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
  Product.findOne({_id: req.body.product_id, is_published: true}, function(err, product) {
    console.log(req.body);
    if (err)
      console.log(err);
    if (!product)
      return res.status(500).json({ error: "Product is invalid" });
    if (parseInt(req.body.quantity) > parseInt(product.options[req.body.option].quantity))
      return res.status(500).json({ error: "Quantity is invalid" });      
    if (!req.session.cart_order) {
      var order = new Order({
        cart: [{ product: product._id, quantity: req.body.quantity, option: req.body.option }],
        status: "Submitted"
      });
      if (req.user) {
        order.user = req.user.id;
        if (req.user.shipping)
          order.shipping = JSON.parse(JSON.stringify(req.user.shipping));
      }
      order.save(function(err) {
        if (err) {
          console.log(err);          
          return res.status(500).json({ error: "Error with order 1" });          
        }
        req.session.cart_order = order._id;
        return res.status(200).json({ success: true, message: "Product added" });
      });
    }
    else {
      Order.findOne({ _id: req.session.cart_order }, function(err, order) {
        if (err) {
          console.log(err);          
          return res.status(500).json({ error: "Error with order 2" });          
        }
        if (!order) {
          return res.status(500).json({ error: "Error with order 3" });
        }
        order.cart.push({ product: product._id, quantity: req.body.quantity, option: req.body.option });
        order.save(function(err) {
          if (err) {
            console.log(err);          
            return res.status(500).json({ error: "Error with order 4" });          
          }
          return res.status(200).json({ success: true, message: "Product added" });
        });
      });
    }
  });
});

router.get('/checkout', function(req, res) {
  if (!req.session.cart_order) {
    return res.redirect('/mall');
  }
  else {
    Order.findOne({ _id: req.session.cart_order }).populate('cart.product coupon').exec(function(err, order) {
      if (err)
        console.log(err);
      if (hasShipping(order)) {
        if (req.user && !order.user) {
          order.user = req.user;
          if (!order.shipping)
            order.shipping = JSON.parse(JSON.stringify(user.shipping));
        }
        getOrderCartTotal(order);
        order.save(function(err) {
          res.render('checkout', { order: order, title: req.__('payment') });
        });
      }
      else {
        res.redirect('/shipping');
      }
    });
  }
});

router.get('/cart', function(req, res, next) {
  Order.findOne({ _id: req.session.cart_order }).populate('cart.product coupon').exec(function(err, order) {
    if (order && order.cart.length > 0) {
      getOrderCartRecap(order);
    }
    else {
      return res.redirect('/');
    }
    return res.render('cart', { order: order });
  });
});

// Update quantities for products in user cart
router.post('/mall/update_cart', function(req, res) {
  if (typeof req.session.cart_order === 'undefined' || !req.session.cart_order) {
    return res.redirect('/cart');
  }
  else {
    Order.findOne({ _id: req.session.cart_order }).populate('cart.product').exec(function(err, order) {
      if (err)
        console.log(err);
      if (!Array.isArray(req.body.quantity)) {
        req.body.quantity = [req.body.quantity];
      }
      console.log(req.body);
      req.body.quantity.forEach(function(item, index) {
        console.log(order.cart.length);
        order.cart[index].quantity = item;
      });
      order.markModified('cart');
      order.save(function(err) {
        if (err)
          console.log(err);
        return res.redirect('/cart');
      });
    });
  }
});

// Remove a product from user cart
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

// For login during the checkout process
router.get('/checkout/login', function(req, res) {
  if (req.user) {
    return res.redirect('/checkout');
  }
  if (!res.locals.cart) {
    return res.redirect('/');
  }
  Order.findOne({ _id: req.session.cart_order }).populate('cart.product coupon').exec(function(err, order) {
    if (hasShipping(order)) {
      return res.redirect('/checkout');
    }
    getOrderCartRecap(order);
    res.render('checkout_login', { order: order });
  });
});

router.post('/deposit_checkout', function(req, res) {
  if (req.session.cart_order) {
    Order.findOne({ '_id': req.session.cart_order }).populate('product coupon user').exec(function(err, order) {
        if (order.status == "Waiting")
          return res.status(500).json({ });
        if (err)
          console.log(err);
        order.status = "Waiting";
        console.log(req.body.pay_method);
        order.pay_method = req.body.pay_method;
        order.deliv_method = req.body.deliv_method;
        order.created_at = Date.now();
        //getOrderCartTotal(order);
        if (order.coupon) {
          order.coupon.used = true;
          order.coupon.save();
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
                delete req.session.cart_order;
                if (app.get("env") === "production") {
                  slack.send({
                    channel: '#new-order',
                    icon_url: 'http://yppuna.vn/images/favicon/favicon-96x96.png',
                    text: 'New order <http://yppuna.vn/orders/view/' + order._id + '>',
                    unfurl_links: 1,
                    username: 'Yppuna-bot'
                  });
                }             
                res.status(200).json({ success: true });
            });
          });
        })
    });
  }
  else {
    return res.status(500).json({ });
  }
});


// Confirmation for Paid Order from the Admin
router.get('/orders/paid/:id', isAdmin, function(req, res) {
  Order.findOne({ '_id': req.params.id }).populate('product user cart.product').exec(function(err, order) {
    if (err)
      console.log(err);
    if (!order)
      return res.redirect('/orders/list');
    if (order.status == "Paid") {
      return res.redirect('/orders/list');
    }
    order.status = "Paid";
    order.save(function(err) {
      if (err)
        console.log(err);
      order.cart.forEach(function(item) {
        item.product.options[item.option].quantity -= item.quantity;
        item.product.markModified('options');
        item.product.save();
      });
      return res.redirect('/orders/list');
    });
  });
});

router.get('/orders/packing', isMerchantOrAdmin, function(req, res) {
  Order.find({ status: "Packing" }, function(err, orders) {
    res.render('orders/packing', { orders: orders })
  });
});

router.get('/orders/packing/:id', isMerchantOrAdmin, function(req, res) {
  Order.findOne({_id: req.params.id}).populate('user').exec(function(err, order) {
    if (err)
      console.log(err);
    order.status = "Packing";
    order.save(function(err) {
      res.redirect('/orders/packing');
    });
  });
});

// Confirmation that order has been packed.
// Only confirms if all product in order have been packed
router.post('/orders/packed/:id', isMerchantOrAdmin, function(req, res) {
  Order.findOne({ _id: req.params.id }).populate('user').exec(function(err, order) {
    if (err)
      console.log(err);
    console.log(req.body.cart.length);
    if (req.body.cart.length != order.cart.length) {
      res.redirect('/orders/packing');
    }
    else {
      order.status = "Packed";
      order.save(function(err) {
        res.redirect('/orders/list');
      });
    }
  });
});


// Confirmation for Sent Order and notification to the user
router.post('/orders/send/:id', isMerchantOrAdmin, function(req, res) {
  Order.findOne({_id: req.params.id}).populate('user').exec(function(err, order) {
    if (err)
      console.log(err);
    if (!order)
      return res.redirect('/orders/list');
    order.status = "Sent";
    order.ship_code = req.body.ship_code;
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
          subject: 'Hàng của bạn đã được gửi.',
          html: html({ moment: moment, order: order, accounting: accounting, i18n: i18n })
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
    order.status = "Cancelled";
    order.save(function(err) {
      if (err)
        console.log(err);
      order.cart.forEach(function(item) {
        item.product.options[item.option].quantity += item.quantity;
        item.product.markModified('options');
        item.product.save();
      });
      res.redirect('/mypage');
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
      res.redirect('/mypage');
    });
  });
});

router.get('/shipping', function(req, res) {
  if (!req.session.order && !req.session.cart_order)
    return res.redirect('/');
  else
    Order.findOne({ '_id': req.session.cart_order }).populate('cart.product coupon').exec(function(err, order) {
      if (req.user && hasShipping(req.user) && !hasShipping(order)) {
        order.shipping = JSON.parse(JSON.stringify(req.user.shipping));
      }
      getOrderCartRecap(order);
      return res.render('shipping', { title: req.__('shipping'), order: order });
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
      .validate('address', i18n.__('user.address1'), {
        required: true
      })
      .validate('city', i18n.__('user.city'), {
        required: true
      });
      if (req.user) {
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
                address: req.body.address,
                city: req.body.city,
                zipcode: req.body.zipcode,
                phone_number: req.body.phone_number,
                district: req.body.district,
                ward: req.body.ward
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
            required: false
        });

        req.Validator.getErrors(function(errors){
          if (errors.length > 0) {
            res.render('shipping', { errors: errors, title: req.__('shipping'), order: order });
          }
          else {
            order.shipping = {
                full_name: req.body.full_name,
                address: req.body.address,
                city: req.body.city,
                district: req.body.district,
                ward: req.body.ward,
                phone_number: req.body.phone_number
            }
            order.email = req.body.email;
            order.save(function(err) {
              if (err) {
                res.render('shipping', { errors: err, title: req.__('shipping'), order: order });
              }
              else {
                console.log(order);
                  return res.redirect('/checkout');
              }
            });
          }
        });
      }
  });
});

router.post('/orders/get_products', function(req, res) {
  Order.findOne({ _id: req.body.id }, 'cart shipping').populate('cart.product').exec(function(err, order) {
    res.status(200).json({ order: order });
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