var redis = require("redis");
var client = redis.createClient();

client.on("error", function (err) {
    console.log("Error " + err);
});

client.hget(["contents", "/marci"], function(err, res) {
	console.log(res);
});