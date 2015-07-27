var Parser = require('parse5').Parser,
    Https = require('https'),
    mysql = require('../models/mysql.js'),
    antigate = require('./anti-gate.js'),
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
                        "ria.com"
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
                proxy = "http://"+proxy;

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
            if(seek[0] !== undefined) link = seek[0];

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
        grab: function (keyword, proxy, breaked) {
            var self = this;

            keyword = encodeURI(keyword);

            return new Promise(function(resolve, decline) {
                var destination = self.params.destination.google,
                    searchReq = destination.method + keyword,
                    httpsRequest, chunked = "";
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
                        timeout: 1000,
                        followRedirect: true,
                        maxRedirects: 10,
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
                            var resultChecking  = antigate.process(res.headers.location);
                            resultChecking.then(function(checked) {
                                  console.log("on CAPTCHA: ", checked);
                            }).
                            catch(function(err) {
                                console.log("on CAPTCHA ERROR: ", err);
                            })

                        }

                        if(res.statusCode !== 200) {
                            decline(JSON.stringify(res.headers));
                            return;
                        };

                        res.setEncoding('utf8');
                        res.on('data', function(resp) {

                            console.log("-- DATA CHUNK --");
                            chunked += resp.toString();

                        })
                        .on('end', function() {
                            console.log("-- END REQUEST --");
                              
                            resolve(self.parse(chunked));
                        })
                        .on('error', function(err) {
                            console.error("ON request: " + searchReq);

                            console.log(err);
                            decline(err);
                        });
                    });

                    httpsRequest.on('error', function(err) {
                        console.error("ON connection: " + searchReq);

                        console.log(err);
                        decline(err);
                        return;
                    });

                    console.log("-- ended --");
                    httpsRequest.end();
                }

            });


        },
        proxy: function(keyword) {


            var self = this;
            var proxies = [
                "89.46.101.122:80",
                "199.200.120.140:8089",
                "81.163.88.65:8080",
                "1.179.143.178:312",
                "115.127.64.58:8080",
                "60.207.166.152:80",
                "46.10.205.103:8080",
                "46.191.237.118:1080",
                "52.4.21.225:80",
                "104.41.151.86:80",
                "50.115.194.97:8080",
                "119.40.98.26:8080"
            ], promises = [], self = this, response;

            return new Promise(function(resolve, decline) {


                for(proxy of proxies) {
                    promises.push(self.grab(keyword, proxy, true));
                }

                response = Promise.all(promises, function(result) {
                    resolve(result);
                }).
                catch(function(err) {

                  console.log(err);
                    // TODO: log error
                    //decline(err);
                });

            });
        }
    };

module.exports = parser;
