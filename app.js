// INIT packages
'use strict';

var Parser = require('parse5').Parser,
    Prodvigator = require('./services/prodvigator'),
    co = require('co');

//logic
//var parser = new Parser(), doc = parser.parse('<!DOCTYPE html><html><head></head><body>Hi there!</body></html>');


require('seneca')()
    .add( { aggregate:'top'}, function(args, done) {
        //
        if(!args.link || !args.project) done(null,null);
        var resp, result;

          resp = Prodvigator.check(args.link, args.project);

          co(resp).then(function (value) {
            done(null, {link: args.link, project: args.project, data:value});
          }, function (err) {
            done(null, {link: args.link, project: args.project, data:null, error: err.stack});
          });
    } )
    //.add( { generate:'id', type:'nid'}, id.nid )
    .listen();
