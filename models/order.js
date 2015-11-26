var mongoose = require('mongoose');
var mongooseToCsv = require("mongoose-to-csv");
var Schema = mongoose.Schema;

var orderSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: 'User' },
	product: { type: Schema.Types.ObjectId, ref: 'Product' },
	status: String,
	trackLink: String,
	created_at: { type : Date, default : Date.now },
	option: String,
	quantity: Number,
	shipping: {
		full_name: String,
		address: String,
		address_extra: String,
		country: String,
		zipcode: String,
		phone_number: String
  	},
	email: String,
	payco: {
		orderNo: String,
		sellerOrderReferenceKey: String,
		orderCertifyKey: String,
		totalOrderAmt: Number,
		paymentDetails: Object,
		cancelTradeSeq: Number,
		cancelPaymentDetails: Object
	},
	deposit_name: String
});

orderSchema.plugin(mongooseToCsv, {
	headers: 'option quantity fullname address country zipcode phone_number',
	constraints: {
		'fullname': 'shipping.fullname',
		'address': 'shipping.address',
		'country': 'shipping.country',
		'zipcode': 'shipping.zipcode',
		'phone_number': 'shipping.phone_number',
	}
});

var Order = mongoose.model("Order", orderSchema);

module.exports = Order;