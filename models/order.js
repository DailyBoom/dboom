var mongoose = require('mongoose');
var bcrypt = require("bcrypt");
var Schema = mongoose.Schema;

var orderSChema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: 'User' },
	product: { type: Schema.Types.ObjectId, ref: 'Product' },
	status: String,
	trackLink: String,
	created_at: { type : Date, default : Date.now }
});

var Order = mongoose.model("Order", orderSChema);

module.exports = Order;