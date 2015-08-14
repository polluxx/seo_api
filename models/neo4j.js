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
    findDomainKeywords: function(args) {
        var self = this, resultData = {items:null, total:0};
        return new Promise(function(resolve, reject) {
            ASQ(function(done) {

                if(args.newCheck !== undefined) done(null);

                if(args.target === undefined) reject("Error: target param is not provided");

                self.domainKeywords(args.target, args).then(function(response) {
                    console.log(response);
                    if(response.errors.length) reject(response.errors);

                    if(response.results[0] === undefined) {
                        reject("Empty response");
                        return;
                    }

                    if(!response.results[0].data.length) {
                        reject("По данной ссылке ключей не найдено");
                        return;
                    }

                    self.domainKeywords(args.target, args, true).then(function(response) {
                        resultData.total = response.results[0].data[0].row[0];
                        resolve(resultData);
                    });

                    resultData.items = response.results[0].data.map(function(item) {
                        return item.row[0];
                    });

                }).catch(function(err) {
                    reject(err);
                    return;
                });


            })
            .then(function(done, keywords) {

                    var options = {
                            host: "localhost",
                            port: 3000,
                            path: '/rabbit/pub?message={"role":"publish","type":"top100","target":"'+args.target+'"}',
                            method: 'GET'
                        },

                        request = http.request(options, function (resp) {
                            //console.log(resp.data);


                            console.log('STATUS: ' + resp.statusCode);
                            if (resp.statusCode !== 200) {
                                reject(resp);
                                return;
                            }

                            resolve("Data set to queue");

                        });

                        request.on('error', function(err) {
                            //console.log(err);
                            reject(err);
                        });

                        request.write('');
                        request.end();

                    console.log("ON REQ");
                    console.log(options);

            });
        });
    },
    findKeywordsLinks: function(args) {
        var self = this, keywords = [], unique = [], row;
        return new Promise(function(resolve, reject) {

            ASQ(function(done) {
                  keywords = args.keywords;
                    if(keywords !== undefined) {
                        done(keywords);
                        return;
                    }

                    if(args.target === undefined) {
                        reject("Empty target");
                        return;
                    }

                    self.domainConcurrents(args.target).then(function(response) {
                        if(response.errors.length) reject(response.errors);

                        if(response.results[0] === undefined || !response.results[0].data.length) {
                            reject("Empty response from DB. Try to aggregate data.");
                            return;
                        }

                        resolve(response.results[0].data.reduce(function(prev, next, index) {

                            row = decodeURI(next.row[0].src);
                            if(index > 1) unique = prev;
                            if(!~unique.indexOf(row)) unique.push(row);

                            if(index === 1) {
                                row = decodeURI(prev.row[0].src);
                                if(!~unique.indexOf(row)) unique.push(row);
                            }

                            return unique;
                        }));
                    }).catch(function(err) {
                        reject(err);
                        return;
                    });


              })
              //.promise()
              .then(function (done, keywords) {

                  reject("Concurrents in process");
                  self.promiseKeywords(keywords, resolve, reject);
              })
        });
    },
    promiseKeywords: function(keywords, resolve, reject, newCheck) {

        var promises = [], keyword, linkFunct;
        for(keyword of keywords) {
            linkFunct = this.checkKeywordsLinks(keyword, 100, newCheck);
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
    },
    checkKeywordsLinks: function(keyword, limit, newCheck) {
        var self = this, query, params = {limit: limit}, response;
        return new Promise(function(resolve, reject) {

            if(keyword === undefined || (typeof keyword !== "string")) {
                reject("keyword is not an string or empty");
            }

            ASQ(function(done) {

                if(newCheck !== undefined) done(null);

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

                   });
               });
               request.on('error', function (e) {
                   //console.log('problem with request: ' + e.message);
                   reject({"error": e.message, "raw": e, data: null});
               });

               request.end();

            });
        });
    },
    publishTop100: function(link) {
        var self = this;


        return new Promise(function(resolve, reject) {
            var options = {
                    host: "localhost",
                    port: 10101,
                    path: '/act?role=aggregate&type=top&link='+link,
                    method: 'GET'
                },
                raw = "",
                items = [],
                request = http.request(options, function (resp) {
                    //console.log(resp);
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


                        console.log("START new check");


                        if(result.data === undefined || result.data[0] === undefined) {
                            reject("empty response");
                            return;
                        }

                        if(result.data[0].error !== undefined && !result.data[0].items.length) {

                            // #todo LOGING
                            reject(result.data[0].error);
                            return;
                        }

                        items = result.data[0].items;

                        console.log("END new check");
                        resolve(self.publishKeywords(items[1]));
                        //console.log(items);
                        //resolve("Data received");
                    });
                });
            request.on('error', function (e) {
                console.log(e);
                //console.log('problem with request: ' + e.message);
                reject({"error": e.message, "raw": e, data: null});
            });

            request.end();
        });
    },
    publishConcurrents: function(link) {
        var self = this;
        return new Promise(function(resolve, reject) {

            self.findDomainKeywords({target: link}).then(function(response) {
                if(!response) return;
                self.promiseKeywords(response, resolve, reject, true);
            }).catch(function(err) {
                reject(err);
            });
        });
    },
    publishConcurrentKeywords: function(target) {
        var self = this, concurrent, promises = [];
        this.findKeywordsLinks({target: target})
            .then(function(concurrents) {
                console.log(concurrents);

                for(concurrent of concurrents) {
                    promises.push(self.findDomainKeywords({target: concurrent, newCheck: true}));
                }

                Promise.all(promises)
                    .then(function(response) {
                        //console.log(response);
                        //resolve(response);
                        console.log("LINK ACKNOWLEDGED");
                    })
                    .catch(function(err) {
                        console.error(err)

                    });

            })
            .catch(function(err) {
                console.error(err);
            });
    },
    publishKeywords: function(keywords){
        console.log(" -- PUBLISH LINKS FROM PRO -- ");
        var keyword, query = "", domain = keywords[0].url, label = "", unique = [], translit = "";

        query += 'MERGE (domain:Link {src:"'+domain+'"}) ON MATCH SET domain.updated = timestamp()\r\n';

        for(keyword of keywords) {
            label = transliteration.transliterate(keyword.keyword).replace(/\s/g, "").match(/\w+/g).join("");

            if(~unique.indexOf(label)) continue;
            unique.push(label);
            query += 'MERGE ('+label+':Keyword {src:"'+decodeURI(keyword.keyword)+'"}) \r\n ' +
            'ON CREATE SET '+label+'.queriesCount = '+keyword.region_queries_count+',' +
            label+'.position = '+keyword.position+' \r\n ' +
            'ON MATCH SET '+label+'.updated = timestamp(),' +
            label+'.position = '+keyword.position+' \r\n';

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
            query += 'MERGE ('+label+')-[:TOP10{position:'+link.position+'}]-(keyword)\r\n';
        }
        this.cypher(query, null, function(err, response) {
            console.log(err);
            console.log(response);
        });

    },
    buildPaginator: function(link, additional, isCount) {
      var order = "ASC", orderby = "position", limit = "", index;
      if(additional !== undefined) {
          if(additional.sorting !== undefined) {
              for(index in additional.sorting) {
                  orderby = index;
                  order = additional.sorting[index];
              }
          }
          if(additional.count !== undefined) {
              limit = " LIMIT " + additional.count;
          }
          if(additional.page !== undefined && additional.page > 1) {

              limit = " SKIP " + (additional.page-1) * (additional.count || 10) + limit;
          }
      }
      return (isCount === undefined) ? "keyword ORDER BY keyword."+orderby+" "+order+" "+limit : "COUNT(DISTINCT keyword) as total";

    },
    domainKeywords: function(link, additional, isCount) {
        var query = "MATCH (n:Link)-[:CONTAINS]->(keyword) WHERE n.src = '"+link+"' RETURN " + this.buildPaginator(link, additional, isCount);
        //console.log(query);
        return this.request(query);
    },
    concurrentKeywords: function(target) {
        var query = "MATCH (n:Link)-[:CONTAINS]->(keyword) WHERE n.src = '"+link+"' RETURN " + this.buildPaginator(link, additional, isCount);
        return this.request(query);
    },
    domainConcurrents: function(link) {
        var query = "MATCH (n:Link)-[:CONTAINS]->(keyword)-[t:TOP10]-(r:Link) WHERE n.src = '"+link+"' RETURN r";
        return this.request(query);
    },
    request: function(query) {
        var self = this;

        return new Promise(function(resolve, reject) {

            self.cypher(query, null, function(err, response) {
                if(err) reject(err);

                resolve(response);
            });
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
