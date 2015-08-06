// INIT packages
'use strict';

var Prodvigator = require('./services/prodvigator'),
    //Cassandra = require('./models/cassandra'),
    Parser = require('./services/parser'),
    rabbit = require('./services/rabbit'),
    mysql = require('./models/mysql.js'),
    neo4j = require('./models/neo4j.js'),
    co = require('co');

//logic


    require('seneca')({
        transport:{
            web:{
                timeout:20000
            },
            tcp:{
                timeout:120000
            }
        }
    })
    .add( { role:'aggregate', type:'top'}, function(args, done) {
        //
        if(!(args.link)) done(true, {error: 'no link provided'});
        var resp, result;

          resp = Prodvigator.check(args);

          //Cassandra.list();

          co(resp).then(function (value) {
            done(null, {link: args.link, project: args.project, data:value});
          }, function (err) {
            done(null, {link: args.link, project: args.project, data:null, error: err.stack});
          });
    } )
    .add( {role:'aggregate', type:'concurrents'}, function(args, done) {
        if(args.keywords === undefined || !args.keywords instanceof Array) done(true, {error: 'right links are not provided'});
        var result = Prodvigator.concurrents(args);

        co(result).then(function (value) {
          done(null, {arga: args, data:value});
        }, function (err) {
          done(null, {arga: args, data:null, error: err.stack});
        });
    } )
    .add( {role: 'parse', type: 'concurrents'}, function(args, done) {
        if(args.keyword === undefined) done(true, {error: "main param is not provided"});

        var encoded = args.encoded || false, keyword = encoded ? decodeURI(args.keyword) : args.keyword, response = Parser.proxy(keyword);
        co(response).then(function (value) {
            done(null, {args: args, data:value});
        }, function (err) {
            done(null, {args: args, data:null, error: err.stack});
        });
    })
    .add({role: 'mysql', type: 'proxies'}, function(args, done) {
        if(args.pass === undefined || args.pass !== "nD54zM1") done(true, {error: "you don't have permissions"});

        var data = mysql.proxies(args);
        co(data).then(function (value) {
            done(null, {args: args, data:value});
        }, function (err) {
            done(null, {args: args, data:null, error: err.stack});
        });
    })

    // NEO4J
    .add({role: 'check', type: 'concurrents'}, function(args, done) {
        if(args.keywords !== undefined && !args.keywords instanceof Array) {
            done(true, {error: 'argument keywords isn\'t an instance of Array'});
        }

        var data = neo4j.findKeywordsLinks(args);
        co(data).then(function (value) {
            done(null, {args: args, data:value});
        }, function (err) {
            done(null, {args: args, data:null, error: err.stack || err});
        });
    })
    .add({role: 'check', type: 'top100'}, function(args, done) {
        if(args.target !== undefined && !args.target instanceof String) {
            done(true, {error: 'argument target isn\'t an instance of String'});
        }

        var data = neo4j.findDomainKeywords(args);
        co(data).then(function (value) {
            done(null, {args: args, data:value});
        }, function (err) {
            done(null, {args: args, data:null, error: err.stack || err});
        });
    })

    // PUBLISH
    .add({role: 'publish', type: 'concurrents'}, function(args, done) {
        if(args.target !== undefined && !args.target instanceof String) {
            done(true, {error: 'argument target isn\'t an instance of String'});
        }

        neo4j.publishConcurrents(args.target);
        done(null, {args: args, data:null});
    })
    .add({role: 'publish', type: 'concurrent-keys'}, function(args, done) {
        if(args.target !== undefined && !args.target instanceof String) {
            done(true, {error: 'argument target isn\'t an instance of String'});
        }

        neo4j.publishConcurrentKeywords(args.target);
        done(null, {args: args, data:null});
    })

    // RABBIT
    .add({role: 'rabbit', type: 'pub'}, function(args, done) {
        if(args.message === undefined) done(true, {error: "message is not defined"});

            rabbit.pub(args.message);
            done(null, {message: "OK"});
    })

    .add({role: 'rabbit', type: 'sub'}, function(args, done) {
        rabbit.sub();
        done(null, {message: "LISTENING"});
    })
    .act({role: 'rabbit', type: 'sub'})
    //.add( { generate:'id', type:'nid'}, id.nid )
    .listen({timeout:22000});
