var mongoose = require('mongoose');
var mongooseToCsv = require("mongoose-to-csv");
var moment = require("moment");
var shortid = require('shortid');
var Schema = mongoose.Schema;
var mongoosePaginate = require('mongoose-paginate');

var shipmentSchema = new Schema({
	_id: {
    	type: String,
    	'default': shortid.generate
	},
    name: String,
    line: String,
    price: Number,
    quantity: Number,
    from: String,
    est_date: Date,
    status: String,
    note: String,
    rec_quantity: Number,
    brk_quantity: Number,
    to: String,
    arr_date: Date,
    created_at: { type : Date, default : Date.now }
});

shipmentSchema.plugin(mongoosePaginate);

var Shipment = mongoose.model("Shipment", shipmentSchema);

module.exports = Shipment;