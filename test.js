var redis = require("redis");
var client = redis.createClient();

client.on("error", function (err) {
    console.log("Error " + err);
});

client.hscan(["contents", 0, "MATCH", "/marci*"], function(err, res) {
	var obj = {};
	for (var i = 0; i < res[1].length / 2; i++) {
		obj[res[1][i*2]] = res[1][i*2+1];
	}
	console.log(obj);
	client.quit();
});