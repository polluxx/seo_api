'use strict';

var http = require("http"),
r = require("request"),
transliteration = require('transliteration.cyr'),
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
                    if(keywords !== undefined) {
                        done(keywords);
                        return;
                    }

                    if(args.target === undefined) reject("Error: target param or keywords is not provided");

                    reject("Data is not ready yet");

                    var options = {
                            host: "localhost",
                            port: 10101,
                            path: '/act?role=aggregate&type=top&link='+args.target,
                            method: 'GET'
                        },
                        raw = "",
                        items = [],
                        request = http.request(options, function (resp) {
                            if(resp.statusCode !== 200) {
                                reject(resp);
                                return;
                            }
                            resp.setEncoding('utf8');

                            resp.setTimeout(3000);
                            resp.on('data', function (chunk) {
                                raw += chunk;
                            });

                            resp.on("end", function(resp) {
                                var result = JSON.parse(raw);

                                if(result.data === undefined || result.data[0] === undefined) {
                                    reject("empty response");
                                    return;
                                }

                                items = result.data[0].items;

                                self.publishKeywords(items);
                                //console.log(items);
                            });
                        });
                    request.on('error', function (e) {
                        //console.log('problem with request: ' + e.message);
                        reject({"error": e.message, "raw": e, data: null});
                    });

                    request.end();
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
                        //return;
                    }

                    done(result);
                })
                .catch(function(err) {
                    reject(err);
                });
            }).
            then(function(_, resp) {
              console.log(resp);
              //return;

              if(resp !== null) {
                  resolve(resp);
                  //return;
              }

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

                   resp.setTimeout(3000);
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
    publishKeywords: function(keywords){
        console.log(" -- PUBLISH LINKS FROM PRO -- ");
        var keyword, query = "", domain = keywords[0].url, label = "", unique = [];

        query += 'MERGE (domain:Link {src:"'+domain+'"}) ON MATCH SET domain.updated = timestamp()\r\n';

        for(keyword of keywords) {
            label = transliteration.transliterate(keyword.keyword).replace(/\s/g, "").match(/\w+/g).join("");

            if(~unique.indexOf(label)) continue;
            unique.push(label);
            query += 'MERGE ('+label+':Keyword {src:"'+decodeURI(keyword.keyword)+'"}) \r\n ON MATCH SET '+label+'.updated = timestamp()\r\n';

            // ADD connection with Link and Keyword
            query += 'MERGE (domain)-[:CONTAINS]->('+label+')\r\n';

        }
        this.cypher(query, null, function(err, response) {
            console.log(err);
            console.log(response);
        });
    },
    publishLinks: function(links, keyword) {
        console.log(" -- PUBLISH DATA FROM PARSE -- ");

        // ADD Keyword
        var query = 'MERGE (keyword:Keyword {src:"'+decodeURI(keyword)+'"}) ON CREATE SET keyword.top = "'+links[0].src+'" ON MATCH SET keyword.top = "'+links[0].src+'", keyword.updated = timestamp()\r\n',
        link, label;

        for(link of links) {
            label = link.src.match(/\w+/g).join("");
            // ADD Link node
            //query += 'MERGE ('+label+':Link {src:"'+link.src+'"}) ON CREATE SET '+label+'.position = '+link.position+' ON MATCH SET '+label+'.position = '+link.position+', '+label+'.updated = timestamp()\r\n';
            query += 'MERGE ('+label+':Link {src:"'+link.src+'"}) ON MATCH SET '+label+'.updated = timestamp()\r\n';
            // ADD connection with Link and Keyword
            query += 'MERGE ('+label+')-[:TOP10{position:'+link.position+',updated: timestamp()}]-(keyword)\r\n';
        }
        this.cypher(query, null, function(err, response) {
            console.log(err);
            console.log(response);
        });

    },
    getLinksByKeyword: function (keyword, limit) {
        var self = this, query;

        return new Promise(function(resolve, reject) {
            if(keyword === undefined || typeof keyword !== "string") reject("TypeError: argument is not a string or empty");



            if (limit === undefined || limit > 100) limit = 100;
            query = "MATCH (n:Link)-[:TOP10]->(keyword) where keyword.src = '"+keyword+"' RETURN n,keyword LIMIT "+limit;
            //query = "MATCH (n:Link),(keyword:Keyword) OPTIONAL MATCH (n)-[r1]-(), (keyword)-[r2]-() DELETE n,keyword,r1,r2";
            console.log(query);
            self.cypher(query, null, function(err, response) {
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
