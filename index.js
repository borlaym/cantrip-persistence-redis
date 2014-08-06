var fs = require("fs");
_ = require("lodash");
var redis = require("redis");
var client = redis.createClient();

client.on("error", function (err) {
        console.log("Redis error " + err);
    });

module.exports = {
	setupPersistence: function(callback) {
		var self = this;
		client.hset("cantrip", "/_contents", "object");
		callback();
	},
	syncData: function() {},
	dataStore: {
		deleteNodes: function(path, callback) {
			callback && callback();
		},
		setNode: function(path, value, callback) {
			client.hset("cantrip", path, value);
			callback && callback();
		},
		insertBatch: function(inserts, callback) {
			inserts.unshift("cantrip");
			client.hmset.apply(client, inserts);
			callback && callback();
		},
		get: function(path, callback) {
			client.hscan(["cantrip", 0, "MATCH", path+"*"], function(err, res) {

				if (err) {
					callback(err, null);
					return;
				}

				//Parse the returned values into an object
				var array = [];
				for (var i = 0; i < res[1].length / 2; i++) {
					array.push({path: res[1][i*2], value : res[1][i*2+1]});
				}


				var result = null; //This will hold the resulting object. If there were no documents found, it stays on null
				
				if (array.length === 0) {
					if (path === "/_contents/") callback(null, {});
					else callback({
						error: "Requested node doesn't exist."
					}, null);
					return;
				}

				//Handle single ended queries, when all we return is a single value, an empty object or array
				if (array.length === 1 && path !== "/_contents/") {
					if (array[0].value === "object") result = {};
					else if (array[0].value === "array") result = [];
					else result = {
						value: array[0].value
					}; //return a simple value: value object when the end result would be of a basic type
					callback(null, result);
					return;
				}

				//If there are more than one documents found, let's build the resulting object up from a basic object
				result = {};
				//Dig into the results. We loop through the nodes (objects) returned by the query
				for (var i = 0; i < array.length; i++) {
					var node = array[i]; //This is the current node in our json tree
					if (node.path.replace(path, "").substr(1) === "") {
						if (node.value === "array") result = []; //If the requested root node is an array, replace the base result variable with an empty array
						continue; //This is basically the first result. When we encounter it, we continue
					}
					var toReplace = path === "/" ? "" : path;
					if (path === "/_contents/") toReplace = "_contents/";
					var members = node.path.replace(toReplace, "").substr(1).split("/"); //We omit the request path from the node's path attribute to get a relative reference, also strip the first / character
					var previousNode = null; //This is a pointer to the previous node
					var pointer = result; //This pointer will walk through our json object, searching for the place where the current node resides, so it can add a value to it
					//Loop through the nodes. foo/bar will become result.foo.bar
					for (var j = 0; j < members.length; j++) {
						previousNode = pointer; //This is a pointer to the previously checked node. Used for determining whether we're inside an array or an object
						if (j === members.length - 1) { //At the end of the pointer's walk, we add a value based on the node's value property
							if (node.value === "object") {
								if (_.isArray(previousNode)) previousNode.push({
									_id: members[j]
								});
								else pointer[members[j]] = {};
							} else if (node.value === "array") {
								if (_.isArray(previousNode)) previousNode.push([]);
								else pointer[members[j]] = [];
							} else {
								if (_.isArray(previousNode)) previousNode.push(node.value);
								else {
									try {
										pointer[members[j]] = node.value;
									} catch(err) {}
								}
							}
						} else {
							if (_.isArray(previousNode)) {
								//If the parent node was an array, we can't just use parent.current syntax, we need to find a member of the array by id (or index, in the case of simple arrays instead of collections)
								pointer = _.find(previousNode, function(obj) {
									return obj._id === members[j];
								});
							} else {
								//Set the pointer as parent.current
								pointer = pointer[members[j]];
							}
						}
					}
				}
				callback(null, result);
			});
		},
		set: function(path, data, callback) {
			var inserts = [];
			var self = this;
			if (path === "/_contents/") path = "/_contents";
			client.hget(["cantrip", path], function(err, target) {
				target = [{path: path, value: target}];
				//The function that goes through the data object to insert actual documents to the database
				var insert = function(obj, pointer) {
					for (var key in obj) {
						if (!_.isObject(obj[key])) {
							if (pointer === "/_contents/") pointer = "/_contents"; //Fix when we try to set the root "/"
							if (pointer === "/") pointer = ""; //Fix when we try to set the root "/"
							inserts.push(pointer + "/" + key); inserts.push(obj[key]);
							self.deleteNodes(pointer + "/" + key + "\/"); //Delete all previous values this object had
						} else {
							if (pointer === "/_contents/") pointer = "/_contents"; //Fix when we try to set the root "/"
							if (pointer === "/") pointer = ""; //Fix when we try to set the root "/"
							var keyToContinue = key;
							if (obj[key]._id) {
								keyToContinue = obj[key]._id;
							}
							if (_.isArray(obj[key])) {
								inserts.push(pointer + "/" + key); inserts.push("array");
							}
							else {
								inserts.push(pointer + "/" + keyToContinue); inserts.push("object");
							}
							insert(obj[key], pointer + "/" + keyToContinue);
						}
					}
				};
				//Target is the root or an object
				if (target.length === 0 || target[0].value === "object") {
					//MERGE
					insert(data, path);
					self.insertBatch(inserts, callback);

					//Target is an array
				} else if (target[0].value === "array") {
					//PUSH behavior
					if (!_.isObject(data) || !data._id) {
						//Get the index! We need the maximum index of the object
						self.data.find({
							path: new RegExp(path)
						}, function(err, res) {
							res.toArray(function(err, elements) {
								var index = _.reduce(elements, function(memo, element) {
									var index = Number(element.path.replace(path, "").split("/")[0]);
									if (index > memo) memo = index;
								}, -1) + 1;
								self.setNode(path + "/" + index, "object");
								insert(data, path + "/" + index);
								self.insertBatch(inserts, callback);
							});
						});

					} else {
						//MERGE behavior (not really, but at least we can use the _id property as an index)
						inserts.push(path + "/" + data._id);
						inserts.push("object");
						insert(data, path + "/" + data._id);
						self.insertBatch(inserts, callback);
					}
					//Target is a basic value
				} else {
					callback({
						error: "Can't set value of a basic value."
					}, null);
				}

			});
		},
		delete: function(path, callback) {
			this.deleteNodes(path, function() {
				callback();
			});
		},
		parent: function(path, callback) {
			var parentPath = path.split("/").slice(0, -1).join("/");
			this.get(parentPath, function(err, res) {
				callback(err, res);
			});
		}
	}
}