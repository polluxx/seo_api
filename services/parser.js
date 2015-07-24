var Parser = require('parse5').Parser,
    Https = require('https'),
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
            return temporary;
        },
        getResults: function (items, results) {
            var result = {}, item, i, length = items.length, link, index;


            for(i=0; i<length; i++)
            {
                item = items[i];
                link = item.childNodes[0].childNodes[0].attrs[0].value;
                index = i+1;
                //result.text = (item.childNodes[1].childNodes[1].childNodes[6] !== undefined) ? item.childNodes[1].childNodes[1].childNodes[6].value : "";
                results.push({position: index,src: link});


            }
            return results;

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
        grab: function (keyword, proxy) {
            var self = this;

            keyword = encodeURI(keyword);

            return new Promise(function(resolve, decline) {
                var destination = self.params.destination.google,
                    searchReq = destination.method + keyword,
                    httpsRequest, chunked = "";
                    //request = self.buildRequest(proxy, destination);

                if(destination.secure === true) {


                    httpsRequest = Https.request({
                        // like you'd do it usually...
                        hostname: destination.path,
                        port: 443,
                        method: 'GET',
                        path: searchReq,
                        timeout: 4000,
                        followRedirect: true,
                        maxRedirects: 10,
                        gzip: true,
                        headers: {"Content-Type": "text/plain;charset=utf-8"}

                        // ... just add the special agent:
                        //agent: request
                    }, function (res) {

                        console.log("statusCode: ", res.statusCode);
                        console.log("headers: ", res.headers);



                        res.setEncoding('utf8');
                        res.on('data', function(resp) {
                            console.error("ON request: " + searchReq);
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
                        console.error("ON request: " + searchReq);

                        console.log(err);
                        decline(err);
                    });

                    console.log("-- ended --");
                    httpsRequest.end();
                }

            });


        },
        proxy: function(keyword) {
            var proxies = [
                "201.65.79.114:3128",
                "183.207.228.9:61616",
                "185.72.156.19:7808",
                "185.72.156.19:3127",
                "211.68.122.174:80",
                "118.96.137.205:80",
                "183.207.229.196:8080"
            ], promises = [], self = this, response;

            return new Promise(function(resolve, decline) {

                for(proxy of proxies) {
                    promises.push(self.grab(keyword, proxy));
                }

                response = Promise.all(promises, function(result) {
                    resolve(result);
                });

            });
        }
    };

module.exports = parser;
