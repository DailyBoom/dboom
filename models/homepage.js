var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var homepageSchema = new Schema({
    main_banner: String,
    right_1_banner: String,
    right_2_banner: String,
    beauty_banner: String,
    news_banner: String,
    pedia_banner: String,
    deal_banner: String,
    fav_banner: String,
    organic_banner: String,
    review_1_banner: String,
    review_2_banner: String,
    review_3_banner: String
});

var Homepage = mongoose.model("Homepage", homepageSchema);

module.exports = Homepage;