var Cantrip = require("Cantrip");
var redis = require("./index.js");
var request = require("request");

Cantrip.options.persistence = redis;
Cantrip.options.port = 3000;

Cantrip.start(function() {
});