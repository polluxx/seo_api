var http = require('http'),
    ASQ = require('asynquence');
    Prodvigator = {
    params: {
        host: "prodvigator.ua",
        methods: {
          keywordsByUrl: "/api/v2/url_keywords",
          concurents: "/api/v2/competitors",
          related: "/api/v2/related_keywords"
        },
        rest: {
          page: 1,
          page_size: 1
        },
        token: "990f3b5aadb8bcfe54f7dd013001ce81",
        fields: []
    },
    tmpParams: null,
    projects: {
        1: "https://auto.ria.com",
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


        if(reqParams.limit !== undefined) restItems.page_size = reqParams.limit;
        if(reqParams.page !== undefined) restItems.page = reqParams.page;


        for(index in restItems) {
          restParams.push(index+"="+this.params.rest[index]);
        }

        rest = restParams.join("&");
        console.log(rest);
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
    getItem: function *(reqParams) {
        var self = this,
            query = this.buildQuery(reqParams),
            target = reqParams.queryBody;

        yield new Promise( function (done,reject) {

            console.info("START request - "+ target);

                if(query.error !== null) done({"error": "Error in request! " + query.error});
                
                var options = {
                    host: self.params.host,
                    port: 80,
                    path: query.body,
                    method: reqParams.reqType || 'GET'
                },
                error = null,
                raw = "",
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
        });
        //self.generic.next();
    },
    sequence: function *(reqParams) {
        var self = this, generic, promised, asq, funct, paging, promis, gener,
            responseFun, functs = [], page = 1, failedReq = 0, target = reqParams.queryBody,
            response = {};
        yield new Promise( function (done,reject) {

            /*for(var i=0; i < 10; i ++) {
                promised = null;
                funct = function(page, done) {
                    return function (done) {



                    }
                };

                responseFun = funct(page, function(done){
                    return done;
                });
                functs.push(responseFun);


            }*/



            paging = function *(page) {

                if(page > 3 || response.done) {
                    return yield response;
                }


                reqParams.page = page;
                reqParams.queryBody = target;

                console.log(page);

                for(generic of self.getItem(reqParams)) {
                    promised = generic;
                }

                promised.then(function(resp) {
                    console.log(resp);
                });


                if(promised.data === null) response.done = true;

                ++page;
                if(promised.data !== null) yield paging(page);

                response.error = response.error || null;
                if(promised.data !== null) response.items = (response.items !== undefined) ? response.items.concat(promised.data) : promised.data;
                response.left = promised.left || null;
                yield response;

                /*promised.then(
                    function (resp) {


                        console.log(resp);

                        if(resp.data === null) response.done = true;

                        ++page;
                        if(resp.data !== null) yield paging(page);

                        response.error = response.error || null;
                        if(resp.data !== null) response.items = (response.items !== undefined) ? response.items.concat(resp.data) : resp.data;
                        response.left = resp.left || null;
                        yield response;
                    }
                ).catch(function (err) {
                        //console.log(err);
                        response.error = JSON.stringify(err);
                        ++page;
                        ++failedReq;

                        if(failedReq >= 3) response.done = true;
                        yield response;
                    });*/
            }


            for(generic of paging(page)) {
                promised = generic;
            }

            promised.then(
                function(resp){
                    done(resp)
                }
            ).catch(function(err) {
                console.log(err);
                done({error: JSON.stringify(err)})
            });
            /*asq = ASQ().gate.apply(null, functs);
            asq.then(
                function() {
                    //var args = Array.prototype.slice.call(arguments);

                    //console.log(response);
                    done(response);
                }
            ).or(function(err){
                reject(err);
                console.log(err); // ReferenceError
            });*/



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
            reqParams.prefix = self.projects[reqParams.project] + "/";
            self.params.rest.position_to = 100;



            self.makeResponse(resolve, reject, linksArray, reqParams);


        });

    },
    makeResponse: function(resolve, reject, dataArray, reqParams, encode) {
        var self = this, functs = [], prefix="", suffix="", generic, promised, funct = function(item, done){
            return function(done, elm) {

              if(encode) item = encodeURI(item);

                if(reqParams.prefix !== undefined) prefix = reqParams.prefix;
                if(reqParams.suffix !== undefined) suffix = reqParams.suffix;

              reqParams.queryBody = prefix + item.replace(/^\/|\/$/, "") + suffix;
              for(generic of self.sequence(reqParams)) {
                promised = generic;
              }

               promised.then(
                function(resp){
                  done(resp)
                }
              ).catch(function(err) {
                console.log(err);
                  done({error: JSON.stringify(err)})
              });
            }
        }

        for(linkItem of dataArray) {
            responseFun = funct(linkItem, function(done){
              return done;
            });
            functs.push(responseFun);
        }

        var asq = ASQ().gate.apply(null, functs);
        asq.then(
          function() {
            var args = Array.prototype.slice.call(arguments);
            resolve(args);
          }
        ).or(function(err){
            reject(err);
            console.log(err); // ReferenceError
        });
    },
    concurrents: function(reqParams) {
      var self = this;
      return new Promise( function(resolve, reject) {

          reqParams.method = self.params.methods.concurents;
          reqParams.queryBody = "";
          self.makeResponse(resolve, reject, reqParams.keywords, reqParams, true);

        });
    },

    check: function *(reqParams) {
        var item, res;
        if(!reqParams.link || !reqParams.project) {
            // toDo LOG
            res = yield {error: "no link or project provided"};
            return res;
        }
        res = yield this.list(reqParams);

        return res;
    },
    generic: null,
    itemsList: {}
};

module.exports = Prodvigator;
