var mongoose = require('mongoose');
var bcrypt = require("bcrypt");
var Schema = mongoose.Schema;

var orderSChema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: 'User' },
	product: { type: Schema.Types.ObjectId, ref: 'Product' },
	status: String,
	trackLink: String,
	created_at: { type : Date, default : Date.now },
	shipping: {
		full_name: String,
		address: String,
		address_extra: String,
		country: String,
		zipcode: Number,
		phone_number: Number
  	},
});

var Order = mongoose.model("Order", orderSChema);

module.exports = Order;