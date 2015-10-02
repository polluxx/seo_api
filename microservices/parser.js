'use strict';
module.exports = function parser(options) {

    this.add('role:parser,path:aggregate,operation:*', function(msg, response) {
        this.act({role:'aggregate'}, {
            type: validOpts['check'][msg.operation]
        }, response);
    });
    this.add('role:parser,path:parse,operation:*', function(msg, response) {
        this.act({role:'parse'}, {
            type: validOpts['check'][msg.operation]
        }, response);
    });

    this.add('init:parser', function(msg, response) {
        console.log(msg);
        this.act("role:web", {
            use: {
                prefix: '/parser',
                pin: 'role: parser, path:*',
                map: {
                    aggregate: { GET:true,POST:true, suffix:'/:operation' },
                    parse: { GET:true,PUT:true, suffix:'/:operation' }
                }
            }
        }, response);
    });
};