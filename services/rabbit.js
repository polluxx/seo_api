var rabbit = require('rabbit.js'),
    http = require('http'),
    Rabbit = {
        pub: function(message) {

            if(message === undefined || !message instanceof Object) {
                console.error("Empty publish message");
                return;
            }

            var context = rabbit.createContext();
            context.on('ready', function() {
                var pub = context.socket('PUBLISH'), sub = context.socket('SUBSCRIBE');
                //sub.pipe(process.stdout);
                sub.connect('events', function() {
                    pub.connect('events', function() {
                        pub.write(JSON.stringify(message), 'utf8');
                    });
                });
            });
        },
        sub: function() {
            var context = rabbit.createContext();
            context.on('ready', function() {
                var sub = context.socket('SUBSCRIBE');
                sub.connect('events', function() {
                    sub.setEncoding('utf8');
                    sub.on('data', function(note) {

                        try {
                            var messageData = JSON.parse(JSON.parse(note)), index, params = [];


                            for (index in messageData) {

                                //if(index == 'target') messageData[index] = encodeURIComponent(messageData[index]);


                                params.push(index+"="+messageData[index]);
                            }

                        } catch (err) {
                            console.error(err);
                            return;
                        }
                            var query = params.join("&"),
                            options = {
                                host: "localhost",
                                port: 10101,
                                path: '/act?'+encodeURI(query),
                                method: 'GET'
                            },
                            raw = "",
                            items = [],
                            request = http.request(options, function (resp) {

                                console.log(resp);
                                return;

                                if(resp.statusCode !== 200) {
                                    console.error(resp);
                                    return;
                                }
                                resp.setEncoding('utf8');
                                resp.on('data', function (chunk) {
                                    raw += chunk;
                                });

                                resp.on("end", function(resp) {
                                    var result = JSON.parse(raw);

                                    console.log(result);
                                });
                            });
                        request.on('error', function (e) {
                            //console.log('problem with request: ' + e.message);
                            console.error({"error": e.message, "raw": e, data: null});
                        });

                        request.end();


                    });
                    sub.pipe(process.stdout);

                });
            });

            context.on('error', function(err) {
                console.error(err);
            });
            console.info("LISTENING");
        }
    };

module.exports = Rabbit;
