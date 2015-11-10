var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var orderSChema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: 'User' },
	product: { type: Schema.Types.ObjectId, ref: 'Product' },
	status: String,
	trackLink: String,
	created_at: { type : Date, default : Date.now },
	quantity: Number,
	shipping: {
		full_name: String,
		address: String,
		address_extra: String,
		country: String,
		zipcode: Number,
		phone_number: Number
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
	}
});

var Order = mongoose.model("Order", orderSChema);

module.exports = Order;