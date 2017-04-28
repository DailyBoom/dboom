var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var mallSchema = new Schema({
    category: String,
    title: String,
    text: String,
    banner: String
});

var Mall = mongoose.model("Mall", mallSchema);

module.exports = Mall;