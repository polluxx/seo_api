// INIT packages
'use strict';

var action  = process.argv[2];
var Prodvigator = require('../services/prodvigator'),
//Cassandra = require('./models/cassandra'),
    Parser = require('../services/parser'),
    rabbit = require('../services/rabbit'),
    //mysql = require('./models/mysql.js'),
    neo4j = require('../models/neo4j.js'),
    //cors = require('cors'),
    co = require('co'),
    //app = require('express')(),
    //io = require('socket.io')(8002),
    seneca = require('seneca')({
        transport:{
            web:{
                timeout:20000
            },
            tcp:{
                timeout:120000
            }
        }
    })

        // NEO4J
        .add({path: 'check', operation: 'concurrents'}, function(args, done) {
            if(args.keywords !== undefined && !args.keywords instanceof Array) {
                done(true, {error: 'argument keywords isn\'t an instance of Array'});
            }
            if(args.target !== undefined) args.target = decodeURIComponent(args.target);
            var data = neo4j.findKeywordsLinks(args);

            co(data).then(function (value) {

                done(null, {data:value});
            }, function (err) {
                done(null, {data:null, error: err.stack || err});
            });
        })
        .add({path: 'check', operation: 'concurrent-keys'}, function(args, done) {
            if(args.target !== undefined && !args.target instanceof String) {
                done(true, {error: 'argument target isn\'t an instance of String'});
            }

            if(args.target !== undefined) args.target = decodeURIComponent(args.target);

            var data = neo4j.checkConcurrentKeys(args);
            co(data).then(function (value) {
                done(null, {data:value});
            }, function (err) {
                done(null, {data:null, error: err.stack || err});
            });
        })
        .add({path: 'check', operation: 'top100'}, function(args, done) {
            if(args.target !== undefined && !args.target instanceof String) {
                done(true, {error: 'argument target isn\'t an instance of String'});
            }

            args.target = decodeURIComponent(args.target);

            var data = neo4j.findDomainKeywords(args);
            co(data).then(function (value) {
                done(null, {data:value});
            }, function (err) {
                done(null, {data:null, error: err.stack || err});
            });
        })
        .add({path: 'check', operation: 'count'}, function(args, done) {
            var data = Prodvigator.getRequestsCount(args);
            co(data).then(function (value) {
                done(null, {data:value});
            }, function (err) {
                done(null, {data:null, error: err.stack || err});
            });
        })
        .add({path: 'check', operation: 'query'}, function(args, done) {
            if(args.query === undefined || !args.query instanceof String) {
                done(null, {error: 'argument isn\'t an instance of String or empty'});
            }

            neo4j.cypher(args.query, null, function(err, response) {
                done(err, response);
            });
        })
        .add({path: 'check', operation: 'syno'}, function(args, done) {
            if(args.target !== undefined && !args.target instanceof String) {
                done(true, {error: 'argument target isn\'t an instance of String'});
            }

            if(args.target !== undefined) args.target = decodeURIComponent(args.target);


            var data = neo4j.checkSynopsis(args);
            co(data).then(function (value) {
                done(null, {data:value});
            }, function (err) {
                done(null, {data:null, error: err.stack || err});
            });
        })
        .add({path: 'check', operation: 'yaxmlcount'}, function(args, done) {
            Parser.yandexXmlLimits().then(function(resp) {
                done(null, {data:resp});
            })
                .catch(function(err) {
                    done(null, {data:null, error: err});
                });
        })

        // PUBLISH
        .add({path: 'publish', operation: 'top100'}, function(args, done) {
            if(args.target !== undefined && !args.target instanceof String) {
                done(true, {error: 'argument target isn\'t an instance of String'});
            }

            neo4j.publishTop100(args.target);
            done(null, {args: args, data:null});
        })
        .add({path: 'publish', operation: 'concurrents'}, function(args, done) {
            if(args.target !== undefined && !args.target instanceof String) {
                done(true, {error: 'argument target isn\'t an instance of String'});
            }

            console.log("PUBLISH CONCURR");
            console.log(args.target);
            console.log('---------------------------');


            neo4j.publishConcurrents(args.target);
            done(null, {args: args, data:null});
        })
        .add({path: 'publish', operation: 'concurrent-keys'}, function(args, done) {
            if(args.target !== undefined && !args.target instanceof String) {
                done(true, {error: 'argument target isn\'t an instance of String'});
            }

            neo4j.publishConcurrentKeywords(args.target);
            done(null, {data:"OK"});
        })

        // RABBIT
        .add({path: 'rabbit', operation: 'pub'}, function(args, done) {
            if(args.message === undefined) done(true, {error: "message is not defined"});

            rabbit.pub(args.message);
            done(null, {message: "OK"});
        })

        /*.act('role:web',{use:{

            // define some routes that start with /my-api
            prefix: '/api',

            // use action patterns where role has the value 'api' and cmd has some defined value
            pin: {role:'check',type:'*'},

            // for each value of cmd, match some HTTP method, and use the
            // query parameters as values for the action
            map:{
                top100: true,                // GET is the default
                concurrents: {GET:true},        // explicitly accepting GETs
                count: {GET:true},
                query: {PUT:true, OPTIONS: true},
                syno: {GET: true},
                'concurrent-keys': {GET: true},
                yaxmlcount: {GET: true}
                //qaz: {GET:true,POST:true} // accepting both GETs and POSTs
            }
        }})
        .act('role:web',{use:{

            // define some routes that start with /my-api
            prefix: '/rabbit',

            // use action patterns where role has the value 'api' and cmd has some defined value
            pin: {role:'rabbit',type:'*'},

            // for each value of cmd, match some HTTP method, and use the
            // query parameters as values for the action
            map:{
                pub: {GET: true}                // GET is the default
            }
        }})
        .act('role:web',{use:{
            prefix: '/parse',
            pin: {role:'parse',type:'*'},
            map:{
                checker: {PUT: true, OPTIONS: true}
            }
        }})*/

        //.add( { generate:'id', type:'nid'}, id.nid )
        .listen({timeout:22000, port: 9001, type: 'tcp'})
        .log.info('act ', action);