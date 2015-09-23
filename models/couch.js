"use strict";
var couchbase = require("couchbase"),
    config = require("./config"),
    Couch = {
        cluster: null,
        bucket: null,
        init: function(bucketName) {
            this.cluster = couchbase.Cluster('couchbase://'+config.dbs.couch.host);
            if(bucketName) this.bucket = this.cluster.openBucket(bucketName);
        },
        get: function(id) {
            if(!this.bucket) throw new Error("Bucket is not reachable!");

            this.bucket.get(id, function(err, res) {
                console.log('Value: ', res.value);
            });
        }
};
module.exports = Couch;