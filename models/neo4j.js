'use strict';

var r = require("request"),
seneca = require('seneca'),
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
                      linkFunct = self.findLinkKeywords(keyword, 100);
                      promises.push(linkFunct);
                  }

                  Promise.all(promises)
                  .then(function(response) {
                      //console.log(response);
                      resolve(response);
                  })
                  .catch(function(err) {
                      console.error(err)
                      reject(err);
                  });
              })
        });
    },
    findLinkKeywords: function(link, project) {
        var self = this, query, params = {limit: 100}, response;
        return new Promise(function(resolve, reject) {

            if(link === undefined || (typeof link !== "string") || project === undefined) {
                reject("link is not an string or empty");
            }

            ASQ(function(done) {
                query  = "MATCH (n:Keyword) RETURN n, labels(n) as l LIMIT {limit}";
                response = self.getLinksByKeyword(link, params.limit);
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
            then(function() {

                r.get('http://localhost:10101/act?role=aggregate&type=top&link[]='+link,
                function(err, res) {

                   console.log(err);
                   console.log(res);
                });

            });
        });
    },
    getLinksByKeyword: function (keyword, limit) {
        var self = this;

        return new Promise(function(resolve, reject) {
            if(keyword === undefined || typeof keyword !== "string") reject("TypeError: argument is not a string or empty");



            if (limit === undefined || limit > 100) limit = 100;
            var query  = "MATCH (n:Link) RETURN n, labels(n) as l LIMIT {limit}";

            var response = self.cypher(query, null, function(err, response) {
                if(err) {
                    reject(err);
                    return;
                }

                if(response.errors !== undefined && response.errors.length > 0) {
                    reject(response.errors);
                    return;
                }

                if(response.results.data !== undefined && response.results.data.length) {
                    resolve(response.results);
                    return;
                }

                resolve(null);
            });
        });
    }
};

module.exports = neo4j;
