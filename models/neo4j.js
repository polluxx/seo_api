'use strict';

var http = require("http"),
r = require("request"),
crypto = require("crypto"),
config = require('../config.js'),
ASQ = require('asynquence'),
neo4j = {
    params: {
        url: "http://localhost:7474/db/data/transaction/commit",
        auth: "http://localhost:7474/user/neo4j"
    },
    auth: function() {
      var self = this,
        authParams = config.dbs.neo4j;
        return new Promise(function(resolve, reject) {
          r.get(self.params.auth, {
            headers : {
                Accept: "application/json; charset=UTF-8",
                Authorization: "Basic " + new Buffer(authParams.username+":"+authParams.password).toString('base64')
            }
          },
          function(err, res, data) {
              if(err) reject(err);

              resolve(res);
          });
        })

    },
    cypher: function(query,params,cb) {
      var self = this, authParams = config.dbs.neo4j, body;

        r.post({uri:self.params.url,
                headers : {
                    Accept: "application/json; charset=UTF-8",
                    Authorization: "Basic " + new Buffer(authParams.username+":"+authParams.password).toString('base64')
                },
                json:{
                  statements:[
                    {
                      statement:query,
                      parameters:params
                    }
                  ]
                }
              },
             function(err, res) {

                console.log(err);
                body = res !== undefined ? res.body : null;
                cb(err, body)
             }
         );

    },
    findKeywordsLinks: function(args) {
        var self = this, keywords = [];
        return new Promise(function(resolve, reject) {

            ASQ(function(done) {
                  keywords = args.keywords;
                  if(keywords === undefined) {
                      if(args.target === undefined) reject("Error: target param or keywords is not provided");

                      //keywords =
                  }

                  done(keywords);
              })
              //.promise()
              .then(function (done, keywords) {
                  var promises = [], keyword, linkFunct;
                  for(keyword of keywords) {
                      linkFunct = self.checkKeywordsLinks(keyword, 100);
                      promises.push(linkFunct);
                  }

                  Promise.all(promises)
                  .then(function(response) {
                      //console.log(response);
                      resolve(response);
                  })
                  .catch(function(err) {
                      //console.error(err)
                      reject(err);
                  });
              })
        });
    },
    checkKeywordsLinks: function(keyword, limit) {
        var self = this, query, params = {limit: limit}, response;
        return new Promise(function(resolve, reject) {

            if(keyword === undefined || (typeof keyword !== "string")) {
                reject("keyword is not an string or empty");
            }

            ASQ(function(done) {

                response = self.getLinksByKeyword(keyword, params.limit);
                response.then(function(result) {
                    if(result !== null) {
                        resolve(result);
                        return;
                    }

                    done(result);
                })
                .catch(function(err) {
                    reject(err);
                });
            }).
            then(function(_, resp) {
              console.log(resp);
              return;

              if(resp !== null) done(resp);

               var options = {
                   host: "localhost",
                   port: 10101,
                   path: '/act?role=parse&type=concurrents&keyword='+encodeURI(keyword)+'&encoded=true',
                   method: 'GET'
               },
               raw = "",
               request = http.request(options, function (resp) {
                   console.log('STATUS: ' + resp.statusCode);
                   if(resp.statusCode !== 200) {
                      reject(resp);
                      return;
                   }

                   resp.setEncoding('utf8');
                   resp.on('data', function (chunk) {
                       raw += chunk;
                   });

                   resp.on("end", function(resp) {
                       var result = JSON.parse(raw);

                       if(result.data === undefined) {
                          reject("empty response");
                          return;
                       }

                       resolve(result.data.data);

                       // save into DB

                       console.log(" -- --");
                   });
               });
               request.on('error', function (e) {
                   //console.log('problem with request: ' + e.message);
                   done({"error": e.message, "raw": e, data: null});
               });

               request.end();

            });
        });
    },
    publishLinks(links, keyword) {
        console.log(" -- PUBLISH DATA FROM PARSE -- ");

        //console.log(keyword);

        //var cryptedWord = crypto.createHash('md5').update(keyword).digest("base64"),
        var query = "CREATE (keyword:Keyword {src:'"+decodeURI(keyword)+"', top:'"+links[0].src+"'})",
        link, label;

        for(link of links) {
            label = link.src.match(/\w+/g).join("");
            query += ",("+label+":Link {src:'"+link.src+"', position:"+link.position+"})";

            //if(!first) connections += ",";
            query += ",("+label+")-[:TOP10]->(keyword)";
            //first = false;
        }

        //query += "," + connections;

        var response = this.cypher(query, null, function(err, response) {
            console.log(err);
            console.log(response);
        });

    },
    getLinksByKeyword: function (keyword, limit) {
        var self = this;

        return new Promise(function(resolve, reject) {
            if(keyword === undefined || typeof keyword !== "string") reject("TypeError: argument is not a string or empty");



            if (limit === undefined || limit > 100) limit = 100;
            var query  = "MATCH (n:Link) RETURN n, labels(n) as l LIMIT "+limit;

            query = "MATCH (n:Link)-[:TOP10]->(keyword) where keyword.src = '"+encodeURI(keyword)+"' RETURN n,keyword, labels(n) as l LIMIT 100";
            console.log(query);
            var response = self.cypher(query, null, function(err, response) {
                if(err) {
                    reject(err);
                    return;
                }

                if(response.errors !== undefined && response.errors.length > 0) {
                    reject(response.errors);
                    return;
                }

                if(response.results[0] !== undefined && response.results[0].data !== undefined && response.results[0].data.length) {
                    resolve(response.results[0].data);
                    return;
                }

                resolve(null);
            });
        });
    }
};

module.exports = neo4j;
