var Cantrip = require("Cantrip");
var redis = require("./index.js");
var request = require("request");

Cantrip.options.persistence = redis;
Cantrip.options.port = 3000;

Cantrip.options.redis = {
	port: 6379,
	host: "127.0.0.1",
	auth: null
};

Cantrip.start(function() {
});