var http = require('http'),
    ASQ = require('asynquence'),
    config = require('../config'),
    Prodvigator = {
    params: {
        host: "prodvigator.ua",
        methods: {
          keywordsByUrl: "/api/v2/url_keywords",
          concurents: "/api/v2/keyword_top",
          related: "/api/v2/related_keywords"
        },
        rest: {
          page: 1,
          page_size: 1000
        },
        token: config.services.prodvigator.token,
        fields: []
    },
    sequenceLimit: 3,
    tmpParams: null,
    projects: {
        1: "http://auto.ria.com",
        2: "http://www.ria.com",
        3: "http://dom.ria.com",
        5: "https://market.ria.com"
    },
    buildQuery: function (reqParams) {
        var response = {}, index, restParams = [], restItems = this.params.rest;
        response.error = null;
        if (!reqParams || !reqParams.method) {
          response.error = {"error": 'Error with empty params'}
          return response;
        };
        if (typeof reqParams !== "object") {
          response.error = {"error": 'TypeError: params must be an object!'};
          return response;
        }


        this.tmpParams = reqParams;

        if(reqParams.minus !== undefined) restItems.minus_keywords = reqParams.minus;
        if(reqParams.limit !== undefined) restItems.page_size = reqParams.limit;
        if(reqParams.page !== undefined) restItems.page = reqParams.page;


        for(index in restItems) {
          restParams.push(index+"="+this.params.rest[index]);
        }

        rest = restParams.join("&");

        response.body = reqParams.method + "?" + rest + "&token=" + this.params.token + "&query=" + reqParams.queryBody;

        if(reqParams.fields !== undefined && reqParams.fields instanceof Array) this.params.fields = reqParams.fields;

        return response;
    },
    parseResult: function(item) {
        if(this.tmpParams.fields === undefined || !this.tmpParams.fields.length) return item;
        var resp = {}, fields = this.tmpParams.fields, index, value, length = fields.length;
        for(index=0; index < length; index++) {
            value = fields[index];
            if(item[value] === undefined) continue;
            resp[value] = item[value];
        }
        return resp;
    },
    getItem: function (reqParams, done) {
        var self = this,
            query = this.buildQuery(reqParams),
            target = reqParams.queryBody;

        //yield new Promise( function (done,reject) {

            console.info("START request - "+ target);

                if(query.error !== null) done({"error": "Error in request! " + query.error, data: null});

                var options = {
                    host: self.params.host,
                    port: 80,
                    path: query.body,
                    method: reqParams.reqType || 'GET'
                },
                error = null,
                raw = "",
                responseObjectKeys, objectKey, responseArray = [],
                request = http.request(options, function (resp) {
                    console.log('STATUS: ' + resp.statusCode);
                    if (resp.statusCode !== 200) {
                        done({"error": "Error in request!", raw: resp, data: null});
                    }

                    resp.setEncoding('utf8');
                    resp.on('data', function (chunk) {
                        raw += chunk;
                        console.info("CHUNK request - "+ target);
                    });

                    resp.on("end", function(resp) {
                        console.info("END request - "+ target);

                        var result = JSON.parse(raw);
                          //console.log(result);
                        if(result.status_code !== 200) done({"error": "Code: "+ result.status_code + "; Body: " + result.status_msg, "data": null});

                        result.result = self.filtration(result.result, reqParams);

                        done({
                          "error": error,
                          "data": result.result instanceof Array ? result.result.map(self.parseResult, self) : result.result,
                          "left": result.queries_left});
                    });
                });

            request.on('error', function (e) {
                //console.log('problem with request: ' + e.message);
                done({"error": e.message, "raw": e, data: null});
            });

            console.log("request done!");
            request.end();
        //});
        //self.generic.next();
    },

    filtration: function(data, reqParams) {

        if(data instanceof Object && data.top === undefined) {
            var responseObjectKeys = Object.keys(data), responseArray = [], objectKey;

            for(objectKey of responseObjectKeys) {
                responseArray.push(data[objectKey]);
            }
            if(responseArray.length) data = responseArray;
        }
        if(data.top !== undefined) data = data.top;

        if(reqParams.minus !== undefined) {
            var indexMinus = this.findIndex(data,
                function(element, index) {
                    if(element.domain === reqParams.minus) return true;
                }
            );
            if(~indexMinus) data.splice(indexMinus, 1);
        }

        if(reqParams.limit !== undefined && reqParams.limit < data.length) {
            data = data.slice(0, reqParams.limit);
        }

        return data;
    },
    sequence: function (reqParams) {
        var self = this, done = null, promised,
            page = 1, failedReq = 0, target = reqParams.queryBody,
            response = {}, seqLimit = this.sequenceLimit-1;
        //yield new Promise( function (done,reject) {

            reqParams.page = page;
            //var stepReq = ;
            //stepReq.next();
            return ASQ( function(done){
                    reqParams.queryBody = target;
                    self.getItem( reqParams, done );
                })
                .val(makeResponse)
                .seq( function(token){
                    if(token.data === null || done !== null || (page > seqLimit)) return ASQ(token).val(makeResponse);
                    return flow(token);
                })
                .val(makeResponse);

            function makeResponse(promised) {
                response.error = promised.error || response.error || null;
                if(promised.data && promised.data instanceof Array) response.items = (response.items !== undefined) ? response.items.concat(promised.data) : promised.data;
                response.left = promised.left || response.left || null;
                return response;
            }

            function flow(token) {
                return ASQ(token)
                    .seq( function(token){
                        if(token.data === null || done !== null || (page >= seqLimit)) return ASQ(token).val(makeResponse);

                        page++;
                        reqParams.queryBody = target;
                        reqParams.page = page;

                        promised = ASQ().all(
                            self.request(reqParams)
                        );

                        return promised;
                    })
                    .val(makeResponse)
                    .seq(function(token) {
                        if((page < seqLimit) && done === null) return flow(token);

                        page++;
                        reqParams.queryBody = target;
                        reqParams.page = page;
                        promised = ASQ().all(
                            self.request(reqParams)
                        );
                        return promised;
                    })
                    .val(makeResponse);
            }

            //yield self.request(reqParams);
    },
    request: function(reqParams) {
        var self = this;
        return ASQ( function(done){
            self.getItem( reqParams, done );
        });
    },
    list: function (reqParams) {
        var resp, self = this, linksArray = [], functs = [], funct, linkItem, responseFun;

        return new Promise( function(resolve, reject) {

            if(typeof reqParams.link === "string") {
                // toDo LOG
                if(reqParams.link.length < 5) {
                    resp = {error: "no link provided or link has less 5 symbols"};
                    reject(resp);
                }

                linksArray.push(reqParams.link);
            }

            if(typeof reqParams.link === "object") {
                if(!reqParams.link instanceof Array) {
                    resp = {error: "TypeError: link isn't an array!"};
                    reject(resp);
                }
                linksArray = reqParams.link;
            }

            reqParams.method = self.params.methods.keywordsByUrl;
            //reqParams.prefix = self.projects[reqParams.project] + "/";
            self.params.rest.position_to = 100;

            self.makeResponse(resolve, reject, linksArray, reqParams, false, true);


        });

    },
    makeResponse: function(resolve, reject, dataArray, reqParams, encode, isSeq) {
        var self = this, functs = [], prefix="", suffix="", generic, promised, funct = function(item, done){
            //return function(done, elm) {

              if(encode) item = encodeURI(item);

                if(reqParams.prefix !== undefined) prefix = reqParams.prefix;
                if(reqParams.suffix !== undefined) suffix = reqParams.suffix;

                reqParams.queryBody = prefix + item.replace(/^\/|\/$/, "") + suffix;


                if(isSeq) {
                    promised = self.sequence(reqParams);
                } else {
                    promised = self.request(reqParams);
                }

                return new Promise(function(resolve, reject) {
                    promised
                    .val( function(result, msg){
                        //console.log( result ); // success, all done!
                        resolve(result);
                    })
                    .or( function(err) {
                        console.log( "Error: " + JSON.stringify(err) );
                        reject("Error: " + JSON.stringify(err));
                    } );
                });
            //}
        }

        for(linkItem of dataArray) {
            responseFun = funct(linkItem, function(done){
                return done;
            });

            functs.push(responseFun);
        }


        Promise.all(functs)
            .then(function(response) {
                resolve(response);
            });
    },
    concurrents: function(reqParams) {
      var self = this;
      return new Promise( function(resolve, reject) {

          reqParams.method = self.params.methods.concurents;
          reqParams.queryBody = "";
          reqParams.minus = "ria.com";
          //reqParams.limit = 10;
          self.params.rest.position_to = 11;
          self.makeResponse(resolve, reject, reqParams.keywords, reqParams, true);

        });
    },

    check: function *(reqParams) {
        var item, res;
        if(!reqParams.link) {
            // toDo LOG
            res = yield {error: "no link provided"};
            return res;
        }
        res = yield this.list(reqParams);

        return res;
    },
    findIndex: function(data, callable) {
        if(typeof data !== "object" || !data instanceof Array) throw new Error("TypeError: argument passed is not correct");

        var findedIndex = -1, response;
        data.forEach(function(item, index) {
            response = callable.call(this, item, index);
            if(response) {
                findedIndex = index;
                return;
            }
        });
        return findedIndex;
    },
    generic: null,
    itemsList: {}
};

module.exports = Prodvigator;
