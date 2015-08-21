// INIT packages
'use strict';

var Prodvigator = require('./services/prodvigator'),
    //Cassandra = require('./models/cassandra'),
    Parser = require('./services/parser'),
    rabbit = require('./services/rabbit'),
    mysql = require('./models/mysql.js'),
    neo4j = require('./models/neo4j.js'),
    cors = require('cors'),
    co = require('co'),
    app = require('express')(),
    io = require('socket.io')(8002),
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

    // PARSE
    .add( {role: 'parse', type: 'concurrents'}, function(args, done) {
        if(args.keyword === undefined) done(true, {error: "main param is not provided"});

        var encoded = args.encoded || false, keyword = encoded ? decodeURI(args.keyword) : args.keyword, response = Parser.proxy(keyword);
        co(response).then(function (value) {
            done(null, {args: args, data:value});
        }, function (err) {
            done(null, {args: args, data:null, error: err.stack});
        });
    })
    .add({role: 'parse', type: 'syno'}, function(args, done) {
        if(args.keyword !== undefined && !args.keyword instanceof String) {
            done(true, {error: 'argument keyword isn\'t an instance of String'});
        }

        var encoded = args.encoded || false, keyword = encoded ? decodeURI(args.keyword) : args.keyword, response = Parser.proxy(keyword, 0, true);
        co(response).then(function (value) {
            done(null, {args: args, data:value});
        }, function (err) {
            done(null, {args: args, data:null, error: err.stack});
        });
    })

    // PROXIES
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
        if(args.target !== undefined) args.target = decodeURIComponent(args.target);
        var data = neo4j.findKeywordsLinks(args);

        co(data).then(function (value) {

            done(null, {args: args, data:value});
        }, function (err) {
            done(null, {args: args, data:null, error: err.stack || err});
        });
    })
    .add({role: 'check', type: 'concurrent-keys'}, function(args, done) {
        if(args.target !== undefined && !args.target instanceof String) {
            done(true, {error: 'argument target isn\'t an instance of String'});
        }

        if(args.target !== undefined) args.target = decodeURIComponent(args.target);

        var data = neo4j.checkConcurrentKeys(args);
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

        args.target = decodeURIComponent(args.target);

        var data = neo4j.findDomainKeywords(args);
        co(data).then(function (value) {
            done(null, {data:value});
        }, function (err) {
            done(null, {data:null, error: err.stack || err});
        });
    })
    .add({role: 'check', type: 'count'}, function(args, done) {
        var data = Prodvigator.getRequestsCount(args);
        co(data).then(function (value) {
            done(null, {data:value});
        }, function (err) {
            done(null, {data:null, error: err.stack || err});
        });
    })
    .add({role: 'check', type: 'query'}, function(args, done) {
        if(args.query === undefined || !args.query instanceof String) {
            done(true, {error: 'argument isn\'t an instance of String or empty'});
        }

        neo4j.cypher(args.query, null, function(err, response) {
            done(err, response);
        });
    })
    .add({role: 'check', type: 'syno'}, function(args, done) {
        if(args.target !== undefined && !args.target instanceof String) {
            done(true, {error: 'argument target isn\'t an instance of String'});
        }

        if(args.target !== undefined) args.target = decodeURIComponent(args.target);

        var data = neo4j.checkSynopsis(args);
        co(data).then(function (value) {
            done(null, {args: args, data:value});
        }, function (err) {
            done(null, {args: args, data:null, error: err.stack || err});
        });
    })

    // PUBLISH
    .add({role: 'publish', type: 'top100'}, function(args, done) {
        if(args.target !== undefined && !args.target instanceof String) {
            done(true, {error: 'argument target isn\'t an instance of String'});
        }

        neo4j.publishTop100(args.target);
        done(null, {args: args, data:null});
    })
    .add({role: 'publish', type: 'concurrents'}, function(args, done) {
        if(args.target !== undefined && !args.target instanceof String) {
            done(true, {error: 'argument target isn\'t an instance of String'});
        }

            console.log("PUBLISH CONCURR");
            console.log(args.target);
            console.log('---------------------------');

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
    .add({role: 'io', type: 'sub'}, function(args, done) {
        console.log("start");
            io.on('connection', function (socket) {
                console.log('client connected');
                socket.on('message', function (mess) {
                    console.log(mess);
                    socket.send('hello');
                    io.send(mess);
                });
                socket.on('disconnect', function () {
                    console.log('client disconnected');
                });
            });

        done(null, {message: "LISTEN WEBSOCK"});
    })


    .act('role:web',{use:{

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
            'concurrent-keys': {GET: true}
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

    .act({role: 'rabbit', type: 'sub'})
    .act({role: 'io', type: 'sub'})
    //.add( { generate:'id', type:'nid'}, id.nid )
    .listen({timeout:22000});

    var whitelist = ['http://cm.ria.local:8000', 'http://seo.ria.com', 'http://cm.ria.com', 'http://cm.ria.local', 'http://cm.ria.local:8002'],
    corsOptionsDelegate = function(req, callback){
        var corsOptions;
        if(whitelist.indexOf(req.header('Origin')) !== -1){
            corsOptions = { origin: true, credentials: true }; // reflect (enable) the requested origin in the CORS response
        }else{
            corsOptions = { origin: false }; // disable CORS for this request
        }
        callback(null, corsOptions); // callback expects two parameters: error and options
    };

    app.use(cors(corsOptionsDelegate));
    app.use( require("body-parser").json());
    app.use( seneca.export('web') );


    app.listen(3000);
