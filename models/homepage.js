var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var homepageSchema = new Schema({
    main_banner: { banner: String, title: String, products: [{ type: Schema.Types.ObjectId, ref: 'Product' }], all_product: Boolean },
    right_1_banner: { banner: String, title: String, products: [{ type: Schema.Types.ObjectId, ref: 'Product' }] },
    right_2_banner: { banner: String, title: String, products: [{ type: Schema.Types.ObjectId, ref: 'Product' }] },
    deal_banner: { banner: String, products: [{ type: Schema.Types.ObjectId, ref: 'Product' }] },
    fav_banner: { banner: String, products: [{ type: Schema.Types.ObjectId, ref: 'Product' }] },
    organic_banner: { banner: String, products: [{ type: Schema.Types.ObjectId, ref: 'Product' }] },
    reviews: [{ banner: String, name: String, avatar: String, text: String}]
});

var Homepage = mongoose.model("Homepage", homepageSchema);

module.exports = Homepage;