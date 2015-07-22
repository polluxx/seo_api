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
          page_size: 100
        },
        token: "990f3b5aadb8bcfe54f7dd013001ce81",
        fields: []
    },
    tmpParams: null,
    projects: {
        1: "auto.ria.com",
        2: "www.ria.com",
        3: "dom.ria.com",
        5: "market.ria.com"
    },
    buildQuery: function (reqParams) {
        var response = {}, index, restParams = [];
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

        if(reqParams.limit !== undefined) this.params.rest.page_size = reqParams.limit;
        if(reqParams.page !== undefined) this.params.rest.page = reqParams.page;


        for(index in this.params.rest) {
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
    getItem: function *(reqParams) {
        var self = this;

        var query = this.buildQuery(reqParams);

        yield new Promise( function (done,reject) {

            console.info("START request - "+ reqParams.queryBody);

                if(query.error !== null) done({"error": "Error in request! " + query.error});
console.log(query.body);
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
                        done({"error": "Error in request!", data: resp});
                    }

                    resp.setEncoding('utf8');
                    resp.on('data', function (chunk) {
                        raw += chunk;
                        console.info("CHUNK request - "+ reqParams.queryBody);
                    });

                    resp.on("end", function(resp) {
                        console.info("END request - "+ reqParams.queryBody);

                        var result = JSON.parse(raw);
                          console.log(result);
                        if(result.status_code !== 200) done({"error": "Code: "+ result.status_code + "; Body: " + result.status_msg, "data": null});

                        done({
                          "error": error,
                          "data": result.result instanceof Array ? result.result.map(self.parseResult, self) : result.result,
                          "left": result.queries_left});
                    });
                });

            request.on('error', function (e) {
                //console.log('problem with request: ' + e.message);
                done({"error": e.message, "raw": e});
            });

            console.log("request done!");
            request.end();
        });
        //self.generic.next();
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
            reqParams.queryBody = "http://" + self.projects[reqParams.project] + "/";
            self.makeResponse(resolve, reject, linksArray, reqParams);

            /*Promise.all(functs)
            .then(
              function(items) {
                //console.log(items);
                resolve(items);
              }
            ).catch(
              function( exeption ) {
                  console.warn( exeption );
                  reject({error: JSON.stringify(exeption)});
                  // 'third'
              }
            );*/

            //console.log(functs);

        });

    },
    makeResponse: function(resolve, reject, dataArray, reqParams, encode) {
        var self = this, functs = [], generic, promised, funct = function(item, done){
            return function(done, elm) {

              if(encode) item = encodeURI(item);
              reqParams.queryBody += item;
              for(generic of self.getItem(reqParams)) {
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
            console.log(err); // ReferenceError: foo is not defined
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
