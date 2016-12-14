var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var behaviorSchema = new Schema({
    zone: Number,
    created_at: { type: Date, default: Date.now }
});

var Behavior = mongoose.model("Behavior", behaviorSchema);

module.exports = Behavior;