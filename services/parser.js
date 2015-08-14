var Parser = require('parse5').Parser,
    Https = require('https'),
    Http = require('http'),
    mysql = require('../models/mysql.js'),
    antigate = require('./anti-gate.js'),
    config = require('../config.js'),
    neo4j = require('../models/neo4j.js'),
    HttpsProxyAgent = require('https-proxy-agent'),
    parser = {
        params: {
            destination: {
                google: {
                    path: "www.google.com.ua",
                    secure: true,
                    method: "/search?q="
                },
                yandex: {
                    path: "www.yandex.ua",
                    secure: true,
                    method: "/search/?lr=963&text="
                }
            },
            filters: {
                minus: {
                    links: [
                        //"ria.com"
                    ]
                }
            }
        },
        request: null,
        buildRequest: function(proxy, path) {
            var proxyHost, proxyPort, splitted, request, agent;
            splitted = proxy.split(":");
            proxyHost = (splitted[0] !== undefined) ? splitted[0] : splitted;
            proxyPort = (splitted[1] !== undefined) ? splitted[1] : 80;
            console.log(splitted);
            if(path.secure !== undefined && path.secure === true) {
                //proxy = "http://"+proxy;

                request = new HttpsProxyAgent(proxy);
            } else {
                request = Http.request({
                    host: proxyHost,
                    port: proxyPort,
                    method: "GET",
                    path: path.path
                });
            }

            return request;
        },
        parse: function(content) {
            var pInstance = new Parser();
                result = [],
                results = [],
                doc = pInstance.parse(content);
                var temp = [], temporary;

            var searchBlock = this.findRecurs(doc.childNodes[1]).childNodes[0].childNodes[0];
            //console.log(searchBlock);

            temporary = this.getResults(searchBlock.childNodes, results);

            console.log(temporary);

            return temporary;
        },
        getResults: function (items, results) {
            var result = {}, item, i, length = items.length, link, index;


            for(i=0; i<length; i++)
            {
                item = items[i];
                link = item.childNodes[0].childNodes[0].attrs[0].value;
                index = i+1;

                link = this.filterLink(link);
                if(link === null) continue;

                if(!link.match(/(http:\/\/|https:\/\/).+/g)) continue;
                //result.text = (item.childNodes[1].childNodes[1].childNodes[6] !== undefined) ? item.childNodes[1].childNodes[1].childNodes[6].value : "";
                results.push({position: index,src: link});


            }
            return results;

        },
        filterLink: function(link) {
            var minus, seek;
            for(minus of this.params.filters.minus.links) {
                if(~link.indexOf(minus)) return null;
            }

            seek = link.match(/(http|https):\/\/([\w+?\.\w+])+([a-zA-Z0-9а-яА-Я\~\!\@\#\$\%\^\*\(\)_\-\=\+\\\/\?\.\:\;\'\,]*)?/);
            if(seek !== null && seek[0] !== undefined) link = seek[0];

            return link;
        },
        findRecurs: function(content) {
            var resp;
            if(content.childNodes == undefined) return;

            if(content.nodeName == "div"
                && content.attrs.length == 1
                && content.attrs[0].name == 'id'
                && content.attrs[0].value == "search") {
                return content;
            }

            for(item of content.childNodes) {
                resp = this.findRecurs(item);
                if(!resp || !resp.childNodes) continue;
                return resp;
            }
        },
        grab: function (keyword, proxy, response) {
            var self = this;

            keyword = encodeURI(keyword);

            return new Promise(function(resolve, decline) {
                var destination = self.params.destination.google,
                    searchReq = destination.method + keyword,
                    httpsRequest, chunked = "",

                    request = self.buildRequest(proxy, destination);

                if(destination.secure === true) {
                  // create an instance of the `HttpsProxyAgent` class with the proxy server information


                    httpsRequest = Https.request({
                        // like you'd do it usually...
                        hostname: destination.path,
                        host: destination.path,
                        port: 443,
                        method: 'GET',
                        path: searchReq,
                        timeout: 10000,
                        followRedirect: true,
                        maxRedirects: 5,
                        gzip: true,
                        headers: {"Content-Type": "text/plain;charset=utf-8"},

                        // ... just add the special agent:
                        agent: request
                    }, function (res) {

                        console.log("proxy: ", proxy);

                        console.log("statusCode: ", res.statusCode);
                        console.log("headers: ", res.headers);

                        if(res.statusCode === 302) {
                            // make data check
                            /*var resultChecking  = antigate.process(res.headers.location);
                            resultChecking.then(function(checked) {
                                  console.log("on CAPTCHA: ", checked);
                            }).
                            catch(function(err) {
                                console.log("on CAPTCHA ERROR: ", err);
                            })*/

                        }

                        if(res.statusCode !== 200) {
                            response.errorStack.push(JSON.stringify(res.headers));
                            if(response.errorStack.length === 5) decline(response);
                            return;
                        };

                        res.setEncoding('utf8');
                        res.on('data', function(resp) {

                            console.log("-- DATA CHUNK --");
                            chunked += resp.toString();

                        })
                        .on('end', function() {
                            console.log("-- END REQUEST --");
                            response.data = self.parse(chunked);

                            neo4j.publishLinks(response.data, keyword);
                            console.info("DATA MUST BE RESOLVED");

                            resolve(response);
                        })
                        .on('error', function(err) {
                            console.error("ON request: " + searchReq);

                            console.log(err);
                            response.errorStack.push(err);
                            if(response.errorStack.length === 5) decline(response);
                        });
                    });

                    //httpsRequest.setTimeout(3000);

                    httpsRequest.on('error', function(err) {
                        console.error("ON connection: " + searchReq);
                        response.errorStack.push(err);

                        if(response.errorStack.length === 5) decline(response);
                        console.log(err);
                        //decline(err);
                        return;
                    });

                    console.log("-- ended --");
                    httpsRequest.end();
                }

            });


        },
        getRandomArbitrary: function(min, max) {
            return Math.ceil(Math.random() * (max - min) + min);
        },
        proxy: function(keyword, attempts) {


            var self = this,
            attempts = attempts || 0,
            proxies = [
                "http://177.107.97.246:8080",
                "http://193.25.120.235:8080",
                "http://109.104.144.42:8080",
                "http://186.42.181.203:8080",
                "http://115.127.64.58:8080",
                "http://60.207.166.152:80",
                "http://46.10.205.103:8080",
                "http://46.191.237.118:1080",
                "http://52.4.21.225:80",
                "http://104.41.151.86:80",
                "http://50.115.194.97:8080",
                "http://119.40.98.26:8080"
            ], promises = [], self = this, response, proxy,
            responseStack = {errorStack: [], data:null};

            return new Promise(function(resolve, decline) {

                self.getProxies(self.getRandomArbitrary(1,2000), true).then(function(response) {
                    proxies = response;


                    for(proxy of proxies) {
                        promises.push(self.grab(keyword, proxy, responseStack));
                    }

                    Promise.race(promises).then(function(result) {

                        console.log("PROXY RACE STEP");
                        console.log(result);

                        resolve(result);
                    },function(err) {

                        console.log("PROXY RACE ERROR - ATTEMPT - "+attempts);
                        ++attempts;

                        if(attempts < config.parser.maxAttempts) {
                            return self.proxy(keyword, attempts);
                        } else {
                            console.log("PROXY RACE MORE THAN 3 ATTEMPTS! END");
                            decline("STOP GETTING PROXY");
                            // LOG
                        }

                        //console.log(err);
                        // TODO: log error
                        //decline(err);
                    });

                    //console.log(proxies);
                }).catch(function(err) {
                    decline(err);
                    return;
                });





            });
        },
        getProxies: function (page, checked) {
            console.info("GET PROXIES - PAGE: "+page);
            return new Promise(function(resolve, reject) {

                page = page || 1;
                var options = {
                    host: "rank.ria.com",
                    port: 10101,
                    path: "/act?role=mysql&type=proxies&pass=nD54zM1&page="+page+"&limit=5&status="+checked,
                    method: 'GET'
                },
                raw = "",
                result,

                response,
                request = Http.request(options, function (resp) {
                    if (resp.statusCode !== 200) {
                        reject({"error": "Error in request!", raw: resp});
                        //yield null;
                        return null;
                    }

                    resp.setEncoding('utf8');
                    resp.on('data', function (chunk) {
                        raw += chunk;

                    });

                    resp.on('end', function () {
                        result = JSON.parse(raw);
                        //console.log(result);
                        if(result.data === undefined) {
                            reject("Empty proxies data!");
                            return null;
                        }

                        resolve(result.data.map(function(item) {
                            return item.proxy_type + '://' + item.proxy_host;
                        }));
                    });
                });

                request.on('error', function (e) {
                    reject('problem with request: ' + e.message);

                    return null;
                });
                console.log("request done!");
                request.end();
            });
        }
    };

module.exports = parser;
