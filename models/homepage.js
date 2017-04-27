var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var homepageSchema = new Schema({
    main_banner: { banner: String, title: String, products: [{ type: Schema.Types.ObjectId, ref: 'Product' }] },
    right_1_banner: String,
    right_2_banner: String,
    deal_banner: String,
    fav_banner: String,
    organic_banner: String,
    reviews: [{ banner: String, name: String, avatar: String, text: String}]
});

var Homepage = mongoose.model("Homepage", homepageSchema);

module.exports = Homepage;