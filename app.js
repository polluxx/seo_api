// INIT packages
'use strict';

var Parser = require('parse5').Parser,
    Prodvigator = require('./services/prodvigator'),
    Cassandra = require('./models/cassandra'),
    co = require('co');

//logic
//var parser = new Parser(), doc = parser.parse('<!DOCTYPE html><html><head></head><body>Hi there!</body></html>');


require('seneca')()
    .add( { role:'aggregate', type:'top'}, function(args, done) {
        //
        if(!args.link || !args.project) done(true, {error: 'no project or link provided'});
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
    //.add( { generate:'id', type:'nid'}, id.nid )
    .listen();
