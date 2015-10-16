var elasticsearch = require("elasticsearch"),
    config = require("../config.js"),
Elastic = {
    client: null,
    init: function() {
        this.client = elasticsearch.Client({
            hosts: config.dbs.elastic.hosts,
            log: [
                {
                    type: 'file',
                    //type: 'stream',
                    level: 'error',
                    // config option specific to stream type loggers
                    //stream: mySocket
                    path: '/var/log/elasticsearch_error.log'
                },
                {
                    type: 'file',
                    level: 'trace',
                    // config options specific to file type loggers
                    path: '/var/log/elasticsearch.log'
                }
            ]
        });
    },
    scroll: function(args, resolver) {
        var self = this, searchData = [], results = [], searchLength = 0;

        return new Promise(function(resolve, reject) {
            if(!self.client) reject("Client is not defined");

            self.client.search(
                self.getSearchParams(args),

                // make data
                function scrollUntilEnd(err, resp) {
                    if(err) reject(err.message);

                    results = resp.hits.hits.map(function(item) {
                        if(args.fields) return item.fields;

                        return item._source.doc;
                    });


                    if(!resolver) {
                        searchData = searchData.concat(results);
                        searchLength = searchData.length;
                        if(searchData.length > 2000) reject("Error in scroll items: too many elements in memory");
                    } else {
                        searchLength += results.length;
                    }

                    console.log("scroll!!!!");
                    console.log(resp._scroll_id);
                    console.log(resp.hits.total);
                    console.log(searchLength);
                    console.log(results.length);
                    console.log("-------------");

                    if (resp.hits.total !== searchLength) {
                        if(results.length && resolver) resolver(results, resp.hits.total)();
                        // now we can call scroll over and over
                        self.client.scroll({
                            scrollId: resp._scroll_id,
                            scroll: '30s'
                        }, scrollUntilEnd);

                    } else {
                        if(results.length && resolver) resolver(results, resp.hits.total)();

                        resolve(searchData);
                    }

                }, function (err) {
                    reject(err.message);
                });
        });
    },
    getSearchParams: function(args){
        return {
            index: args.searchIndex || 'seo_search',
            type: 'couchbaseDocument',
            fields: this.getFields(args.fields),
            scroll: '30s',
            size: args.limit || 10,
            from: args.from || 0,
            body: this.buildReq(args),
            ignore: [400, 404]
        };
    },
    buildReq: function(args) {
        return {
            query: {
                match: returnFields(args.queryParams)
            }
        };

        function returnFields(params) {
            if(!params) return {};
            var index, searchObj = {};
            for(index in params) {
                searchObj[index] = params[index];
            }
            return searchObj;
        }
    },
    getFields: function(fields) {
        if(!fields) return null;
        var prefix = "doc.", index;

        if(typeof fields === 'string') {
            fields = prefix+fields;
        } else {
            for(index in fields) {
                fields[index] = prefix+fields[index];
            }
        }
        console.log(fields);
        return fields;
    }
};
module.exports = Elastic;