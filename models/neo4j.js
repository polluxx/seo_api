'use strict';

var http = require("http"),
r = require("request"),
transliteration = require('transliteration.cyr'),
//crypto = require("crypto"),
RateLimiter = require('limiter').RateLimiter,
io = require('socket.io-client'),
config = require('../config.js'),
ASQ = require('asynquence'),
neo4j = {
    params: {
        url: "http://"+config.dbs.neo4j.host+":7474/db/data/transaction/commit",
        auth: "http://"+config.dbs.neo4j.host+":7474/user/neo4j"
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
                            host: config.api,
                            port: 3000,
                            path: '/api/rabbit/pub?message={"type":"api","path":"publish","operation":"top100","target":"'+args.target+'"}',
                            method: 'GET'
                        };
                    self.makeReq(options, resolve, reject);
            });
        });
    },
    makeReq: function(queryParams, resolve, reject) {

        var request = http.request(queryParams, function (resp) {


            console.log('STATUS: ' + resp.statusCode);
            if (resp.statusCode !== 200) {
                reject(resp);
                return;
            }

            resolve("Data set to queue");

        });

        request.on('error', function(err) {

            reject(err);
        });

        request.write('');
        request.end();

        console.log("ON REQ");
        console.log(queryParams);
    },
    getKeywordsOwnProp: function (keywords) {
        if(keywords === undefined) return undefined;

        var keyword, result = [];
        for(keyword in keywords) {
            if(!keywords.hasOwnProperty(keyword)) continue;

            result.push(keywords[keyword]);
        }
        return result;
    },
    findKeywordsLinks: function(args) {
        var self = this, keywords = [], unique = [], row, result = {};
        return new Promise(function(resolve, reject) {

            ASQ(function(done) {
                  keywords = args.keywords;

                    if(keywords !== undefined) {
                        if(typeof keywords === "string") keywords = [keywords];
                        done(keywords);
                        return;
                    }

                    if(args.target === undefined) {
                        reject("Empty target");
                        return;
                    }

                    self.domainConcurrents(args.target, args).then(function(response) {
                        if(response.errors.length) reject(response.errors);


                        if(args.newCheck !== undefined) {
                            //self.publishConcurrents(args.target);

                            var options = {
                                host: config.api,
                                port: 3000,
                                path: '/api/rabbit/pub?message={"type":"api","path":"publish","operation":"concurrents","target":"'+encodeURIComponent(args.target)+'"}',
                                method: 'GET'
                            };

                            self.makeReq(options, resolve, reject);
                            return;
                        }

                        if(response.results[0] === undefined || !response.results[0].data.length) {

                            reject("Empty response from DB. Try to aggregate data.");
                            return;
                        }

                        result.data = response.results[0].data.map(function(item) {
                            return {
                                src: item.row[0],
                                intersection: item.row[1]
                            };
                        }).filter(function(item) {
                            return !item.src.match(/ria.com/);
                        });

                        /*result.data = response.results[0].data.reduce(function(prev, next, index) {

                            row = decodeURIComponent(next.row[0].src);
                            if(index > 1) unique = prev;
                            if(!~unique.indexOf(row)) unique.push(row);

                            if(index === 1) {
                                row = decodeURIComponent(prev.row[0].src);
                                if(!~unique.indexOf(row)) unique.push(row);
                            }

                            return unique;
                        });*/

                        result.total = result.data.length;
                        resolve(result);
                    }).catch(function(err) {
                        reject(err);
                        return;
                    });


              })
              //.promise()
              .then(function (done, keywords) {
                    console.info('START CHECKING BY KEYWORDS');
                    console.info(args.keywords);


                    if(typeof args.keywords === 'string') {
                        args.keywords = [args.keywords];
                    }

                  reject("Concurrents in process");
                  self.promiseKeywords(args.keywords, resolve, reject);
              })
        });
    },
    promiseKeywords: function(keywords, resolve, reject, newCheck) {

        var promises = [], keyword, index, linkFunct, self = this;

        for(index in keywords) {
            keyword = decodeURIComponent(keywords[index]);

            linkFunct = self.checkKeywordsLinks(keyword, 100, newCheck);
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
                    console.info('START CHECKING BY KEYWORDS');

              if(resp !== null) {
                  resolve(resp);
                  //return;
              }

               var options = {
                   host: config.api,
                   port: 3000,
                   path: '/parser/parse/concurrents?keyword='+encodeURI(keyword)+'&encoded=true',
                   method: 'GET'
               },
               raw = "",
               request = http.request(options, function (resp) {
                   console.log('STATUS: ' + resp.statusCode);
                   console.log(resp.data);
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
    checkConcurrentKeys: function(args) {
        var self = this, resultData = {items:null, total:0};
        return new Promise(function(resolve, reject) {
            ASQ(function(done) {

                if(args.newCheck !== undefined) {
                    done(null);
                    return;
                }

                if(args.target === undefined) reject("Error: target param is not provided");

                self.concurrentKeywords(args.target, args).then(function(response) {
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

                    self.concurrentKeywords(args.target, args, true).then(function(response) {
                        resultData.total = response.results[0].data[0].row[0];
                        resolve(resultData);
                    });

                    var tmpObj = {};
                    resultData.items = response.results[0].data.map(function(item) {
                        return item.row[0];
                    }).filter(function(item) {
                        if(!tmpObj[item.src]) {
                            tmpObj[item.src] = true;
                            return true;
                        }
                    });

                }).catch(function(err) {
                    reject(err);
                    return;
                });


            })
                .then(function(done, keywords) {
                    var options = {
                        host: config.api,
                        port: 3000,
                        path: '/api/rabbit/pub?message={"type":"api","path":"publish","operation":"concurrent-keys","target":"'+args.target+'"}',
                        method: 'GET'
                    };
                    self.makeReq(options, resolve, reject);
                });
        });
    },

    querySynonims: function(args, isCount) {
        var self = this, query, limit = "", index, order = "asc", orderby = "keyword.src", returnVal = !isCount ? "DISTINCT synonim, keyword" : "count(DISTINCT synonim)";

        return new Promise(function(resolve, reject) {
            if(args.sorting !== undefined) {
                for(index in args.sorting) {
                    orderby = index;
                    order = args.sorting[index];
                }
            }

            if(args.count !== undefined && !isCount) {
                limit = " LIMIT " + args.count;
            }
            if(args.page !== undefined && args.page > 1 && !isCount) {
                limit = " SKIP " + (args.page-1) * (args.count || 10) + limit;
            }

            //query = "MATCH (n:Link)-[:CONTAINS]->()-[:TOP10]-()-[:CONTAINS]-(keyword)-[:COMES]-(synonim) WHERE n.src = '"+args.target+"'  RETURN  DISTINCT synonim, keyword ORDER BY "+orderby+" "+order + limit;
            query = "MATCH (n:Link  {src: '"+args.target+"'})-[*1..3]-(keyword:Keyword)-[:COMES]-(synonim) RETURN  "+returnVal + (!isCount ? (" ORDER BY "+orderby+" "+order + limit) : "");
            //console.log(query);
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

                    if(isCount) {
                        resolve(response.results[0].data[0].row[0]);
                        return;
                    }

                    var resp = response.results[0].data.map(function(item) {
                        return {
                            synonim: item.row[0].src,
                            keyword: item.row[1].src
                        };
                    });
                    resolve(resp);

                    return;
                }

                resolve(null);
            });
        });
    },
    checkSynopsis: function(args) {
        var self = this, promises = [], keyword, responseData= {};

        return new Promise(function(resolve, reject) {
            ASQ(function(done) {
                // #// TODO: make req

                if(args.newCheck) {
                    done(args.target);
                    return;
                }

                if(!args.target) {
                    reject(encodeURIComponent("не задан целевой url"));
                    return;
                }

                // MAIN
                ASQ(function(done) {
                    self.querySynonims(args).then(function (resp) {
                        responseData.data = resp;
                        done(true);
                    }).catch(function (err) {
                        reject(err);
                    });
                })
                .then(function(done) {
                    // COUNT
                    self.querySynonims(args, true).then(function(resp) {
                        console.log(resp);
                        responseData.total = resp;
                        resolve(responseData);
                    }).catch(function(err) {
                        reject(err);
                    });
                });

            })
            .then(function(done, target) {



                if(target === undefined || args.keywords !== undefined) {
                    //console.log(args.keywords);
                    done(args.keywords);
                    return;
                }


                self.concurrentKeywords(args.target).then(function(response) {
                    if(response.errors.length) reject(response.errors);

                    var items = response.results[0].data.map(function(item) {
                        return item.row[0].src;
                    });
                    done(items);

                }).catch(function(err) {
                    reject(err);
                });
            })
            .then(function(err, keywords) {
                if(keywords === undefined || !keywords instanceof Array || typeof keywords === "string") {
                    reject("keywords is not defined or isnt an instance of the array!");
                    return;
                }

                resolve("Data is on it way");
                for(keyword of keywords) {

                    keyword = decodeURIComponent(keyword);
                    promises.push(self.publishSyno(keyword, resolve, reject));
                }

                Promise.all(promises)
                    .then(function(response) {
                        console.log(response);

                        console.log("SYNO KEYWORD ACKNOWLEDGED");
                    })
                    .catch(function(err) {
                        console.error(err);
                    });
            });
        });
    },


    // PUBLISH
    publishTop100: function(link) {
        var self = this;


        return new Promise(function(resolve, reject) {
            var options = {
                    host: config.api,
                    port: 3000,
                    path: '/parser/aggregate/top?link='+link,
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

                        if(result.data[0].error !== undefined && result.data[0].items === undefined || !result.data[0].items.length) {

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
        var self = this, keywords = [];
        return new Promise(function(resolve, reject) {

            self.findDomainKeywords({target: link}).then(function(response) {

                if(!response || !response.items || !response.items.length) return;


                keywords =  response.items.map(function(item) {
                    return item.src;
                });

                if(!keywords.length) reject("keywords map error!");

                self.promiseKeywords(keywords, resolve, reject, true);
            }).catch(function(err) {
                reject(err);
            });
        });
    },
    publishConcurrentKeywords: function(target) {
        var self = this, concurrent;
            //limiter = new RateLimiter(10, 'minute');
        this.findKeywordsLinks({target: target})
            .then(function(concurrents) {
                //limiter.removeTokens(1, function(err, remainingRequests) {


                    //var concurrentsLinks = concurrents.data.splice(0,1);
                    var concurrentsLinks = concurrents.data;

                    var promises = [];
                    for(concurrent of concurrentsLinks) {
                        promises.push(self.findDomainKeywords({target: encodeURIComponent(concurrent.src), newCheck: true}));
                    }

                    Promise.all(promises)
                        .then(function (response) {
                            //console.log(response);
                            //resolve(response);
                            console.log("CONCURRENTS LINKS ACKNOWLEDGED");
                        })
                        .catch(function (err) {
                            console.error(err)

                        });
                //});
            })
            .catch(function(err) {
                console.error(err);
            });
    },
    publishSyno: function(keyword, resolve, reject) {
        var options = {
            host: config.api,
            port: 3000,
            path: '/parser/parse/syno?keyword='+encodeURI(keyword)+'&encoded=true',
            method: 'GET'
        },
        raw = "";
        this.makeReq(options, resolve, reject);
    },

    // to DB
    publishKeywords: function(keywords){
        console.log(" -- PUBLISH LINKS FROM PRO -- ");
        var keyword, query = "", domain = keywords[0].url, label = "", unique = [], translit = "", self = this;

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
            if(!err) {
                self.chan().send({log: {level:config.log.levels.INFO,
                    message: "TARGET '" + domain + "' done",
                    data: {
                        target: domain,
                        update: true
                    }}});
            }
            console.log(response);
        });
    },
    publishLinks: function(links, keyword) {
        console.log(" -- PUBLISH DATA FROM PARSE -- ");

        // ADD Keyword
        var query = 'MERGE (keyword:Keyword {src:"'+decodeURI(keyword)+'"}) ON CREATE SET keyword.top = "'+links[0].src+'" ON MATCH SET keyword.top = "'+links[0].src+'", keyword.updated = timestamp()\r\n',
        link, label, self = this;

        for(link of links) {
            label = link.src.match(/\w+/g).join("").replace(/\d+/g, "");

            // ADD Link node
            //query += 'MERGE ('+label+':Link {src:"'+link.src+'"}) ON CREATE SET '+label+'.position = '+link.position+' ON MATCH SET '+label+'.position = '+link.position+', '+label+'.updated = timestamp()\r\n';
            query += 'MERGE ('+label+':Link {src:"'+link.src+'"}) ON MATCH SET '+label+'.updated = timestamp()\r\n';
            // ADD connection with Link and Keyword
            query += 'MERGE ('+label+')-[:TOP10{position:'+link.position+'}]-(keyword)\r\n';
        }
        this.cypher(query, null, function(err, response) {
            console.log(err);
            if(!err) {
                self.chan().send({log: {level:config.log.levels.DATA,
                    message: "KEYWORD '" + decodeURIComponent(keyword) + "' done",
                    data: {
                        keyword: decodeURIComponent(keyword)
                    }}});
            }
            console.log(response);
        });

    },
    insertSynonims: function(keyword, synonims) {
        if(!keyword || !synonims) return Error("keyword or synonims are empty");

        var synonim, self = this, label, unique = [], query = 'MERGE (keyword:Keyword {src:"'+decodeURI(keyword)+'"}) ON MATCH SET keyword.updated = timestamp()\r\n';
        for(synonim of synonims) {
            label = transliteration.transliterate(synonim).replace(/\s/g, "").match(/\w+/g).join("");

            if(~unique.indexOf(label)) continue;
            unique.push(label);

            query += 'MERGE ('+label+':Synonim {src:"'+synonim+'"}) ON MATCH SET '+label+'.updated = timestamp()\r\n';
            // ADD connection with Synonim and Keyword
            query += 'MERGE ('+label+')-[:COMES{}]-(keyword)\r\n';
        }
        this.cypher(query, null, function(err, response) {
            console.log(err);
            if(!err) {
                self.chan().send({log: {level:config.log.levels.INFO,
                    message: "по запросу '" + decodeURIComponent(keyword) + "' найдены синонимы",
                    data: {
                        keyword: decodeURIComponent(keyword)
                    }}});
            }
            console.log(response);
            return true;
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
      return (isCount === undefined) ? " DISTINCT keyword ORDER BY keyword."+orderby+" "+order+" "+limit : "COUNT(DISTINCT keyword) as total";

    },
    domainKeywords: function(link, additional, isCount) {
        var query = "MATCH (n:Link)-[:CONTAINS]->(keyword) WHERE n.src = '"+link+"' RETURN " + this.buildPaginator(link, additional, isCount);
        //console.log(query);
        return this.request(query);
    },
    concurrentKeywords: function(link, additional, isCount) {
        //var query = "MATCH (n:Link)-[:CONTAINS]->()-[:TOP10]-(concurrent)-[:CONTAINS]-(keyword) WHERE n.src = '"+link+"' RETURN " + this.buildPaginator(link, additional, isCount);
        var query = "MATCH (n:Link {src: '"+link+"'})-[*1..3]-(keyword:Keyword) RETURN " + this.buildPaginator(link, additional, isCount);

        //console.log(query);
        return this.request(query);
    },
    domainConcurrents: function(link, additional) {
        var order = "desc", orderby = "c", index;
        if(additional.sorting !== undefined) {
            for(index in additional.sorting) {
                orderby = index;
                order = additional.sorting[index];
            }
        }

        var query = "MATCH (n:Link)-[:CONTAINS]->(keyword)-[t:TOP10]-(r:Link) WHERE n.src = '"+link+"' RETURN DISTINCT r.src, count(keyword) as c ORDER BY "+orderby+" "+order;

        //console.log(query);
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
            //console.log(query);
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
    },
    chan: function() {
        return io(config.services.socketio.host);
    }
};

module.exports = neo4j;
