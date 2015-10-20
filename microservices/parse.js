// INIT packages
'use strict';

var Prodvigator = require('../services/prodvigator'),
//Cassandra = require('./models/cassandra'),
    Parser = require('../services/parser'),
    //rabbit = require('../services/rabbit'),
    //rabbit = require('../services/rabbit'),
    //mysql = require('./models/mysql.js'),
    //neo4j = require('../models/neo4j.js'),
    //cors = require('cors'),
    co = require('co'),
    //app = require('express')(),

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

        .add( { path:'aggregate', operation:'top'}, function(args, done) {
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
        .add( {path:'aggregate', operation:'concurrents'}, function(args, done) {
            if(args.keywords === undefined || !args.keywords instanceof Array) done(true, {error: 'right links are not provided'});
            var result = Prodvigator.concurrents(args);

            co(result).then(function (value) {
                done(null, {data:value});
            }, function (err) {
                done(null, {data:null, error: err.stack});
            });
        } )

        // PARSE
        .add( {path: 'parse', operation: 'concurrents'}, function(args, done) {
            if(args.keyword === undefined) done(true, {error: "main param is not provided"});

            var encoded = args.encoded || false, keyword = encoded ? decodeURI(args.keyword) : args.keyword, response = Parser.proxy(keyword);
            co(response).then(function (value) {
                done(null, {data:value});
            }, function (err) {
                done(null, {data:null, error: err.stack});
            });
        })
        .add({path: 'parse', operation: 'syno'}, function(args, done) {
            if(args.keyword !== undefined && !args.keyword instanceof String) {
                done(true, {error: 'argument keyword isn\'t an instance of String'});
            }

            var encoded = args.encoded || false, keyword = encoded ? decodeURIComponent(args.keyword) : args.keyword, response = Parser.yandexXml(keyword, true);
            co(response).then(function (value) {
                done(null, {data:value});
            }, function (err) {
                done(null, {data:null, error: err.stack});
            });
        })

        //RIA PARSERS
        .add({path: 'parse', operation: 'checker'}, function(args, done) {

            if(!args.target || typeof args.target !== "string" || !args.path) {
                done(null, {error: 'argument target or path is empty or isn\'t type of String'});
            }

            var target = decodeURIComponent(args.target).replace(/\/{1,}$|^\/{1,}/g, "");

            Parser.urlChecker(target, args);

            done(null, {data:"OK"});
        })
        //.add({path: 'rabbit', operation: 'sub'}, function(args, done) {
        //    rabbit.sub();
        //    done(null, {message: "LISTENING"});
        //})
        //.act({path: 'rabbit', operation: 'sub'})
        //.add( { generate:'id', type:'nid'}, id.nid )
        .listen({timeout:22000, port: 9002, type: 'tcp'});