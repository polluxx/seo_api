// INIT packages
'use strict';

var Parser = require('parse5').Parser,
    Prodvigator = require('./services/prodvigator');

//logic
//var parser = new Parser(), doc = parser.parse('<!DOCTYPE html><html><head></head><body>Hi there!</body></html>');


require('seneca')()
    .add( { aggregate:'top'}, function(args, done) {
        //
        if(!args.link || !args.project) done(null,null);
        var resp;
        //for(;;) {
            resp = Prodvigator.check(args.link, args.project);
        //}
        done(null, {link: args.link, project: args.project, data:resp});
    } )
    //.add( { generate:'id', type:'nid'}, id.nid )
    .listen();

