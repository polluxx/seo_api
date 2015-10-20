var parseLib = require('parse5'),
    Parser = parseLib.Parser,
    Request = require('request'),
    Https = require('https'),
    Http = require('http'),
    mysql = require('../models/mysql.js'),
    antigate = require('./anti-gate.js'),
    RateLimiter = require('limiter').RateLimiter,
    parseString = require('xml2js').parseString,
    config = require('../config.js'),
    neo4j = require('../models/neo4j.js'),
    //couch = require('../models/couch.js'),
    elasticsearch = require('../models/elastic.js'),
    io = require('socket.io-client'),
    fm = require('../models/files.js'),
    HttpsProxyAgent = require('https-proxy-agent'),
    parser = {
        params: {
            destination: {
                google: {
                    path: "www.google.com.ua",
                    secure: true,
                    method: "/search?tbs=ctr:countryUA&cr=countryUA&q="
                },
                yandex: {
                    path: "yandex.com",
                    secure: true,
                    //method: "/yandsearch/?lr=143&text="
                    method: "/search/xml?l10n=en&user=uid-6nmpnzuy&key=03.299480881:46d7f19d423d13915ef2362deb7eeaaf&query="
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
        chan: function() {
            return io(config.services.socketio.host);
        },
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

            var searchBlock = this.findRecurs(doc.childNodes[1], comparator).childNodes[0].childNodes[0];

            function comparator(content) {
                if(content.nodeName == "div"
                    && content.attrs.length == 1
                    && content.attrs[0].name == 'id'
                    && content.attrs[0].value == "search") {
                    return content;
                }
                return null;
            }
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
                if(item.childNodes[0].childNodes[0].attrs[0] === undefined) {
                    console.error(item.childNodes[0].childNodes[0].attrs);
                    continue;
                }
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
        findRecurs: function(content, comparator, selector, push) {

            var resp;
            if(content.childNodes == undefined) return;

            if(comparator(content, selector)) {
                if(push) {
                    push.push(content);
                } else {
                    return content;
                }
            }

            for(item of content.childNodes) {
                resp = this.findRecurs(item, comparator, selector, push);
                if(!resp || !resp.childNodes) continue;

                if(push) {
                    push.push(resp);
                } else {
                    return resp;
                }
            }
            return push;
        },
        grab: function (keyword, proxy, response, isYandex, limit, destinationObj) {
            var self = this;

            limit = limit || 5;

            keyword = encodeURIComponent(keyword);


            return new Promise(function(resolve, decline) {
                var destination = isYandex === undefined ? self.params.destination.google : self.params.destination.yandex,
                    searchReq = destination.method + keyword,
                    httpsRequest, chunked = "",
                    timeout = setTimeout(function(){
                        console.log("REQ TIMEOUT REACHED!!!");
                        console.log("FOR " + destination.path + " - " + proxy);
                        clearTimeout(timeout);
                        delete timeout;

                        response.errorStack.push("REQ TIMEOUT REACHED FOR PROXY - "+proxy);
                        if(response.errorStack.length === limit) decline(response);
                    }, 20000),
                    request = self.buildRequest(proxy, destination);


                    if(destination.secure === true) {
                  // create an instance of the `HttpsProxyAgent` class with the proxy server information

                    var cookie = self.cookie;
                    if(destinationObj !== undefined) {
                        destination.path = destinationObj.path;
                        searchReq = destinationObj.req;
                        cookie = destinationObj.cookie;
                    }

                    //console.log(searchReq);
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
                        headers: {
                            "Content-Type": "text/plain;charset=utf-8",
                            "Set-Cookie": cookie + "; domain=.yandex.ua; path=/;",
                            "domain": ".yandex.ua",
                            "path":"/"
                        },

                        // ... just add the special agent:
                        agent: request
                    }, function (res) {

                        clearTimeout(timeout);
                        delete timeout;

                        console.log("proxy: ", proxy);

                        console.log("statusCode: ", res.statusCode);
                        console.log("headers: ", res.headers);

                        //if(res.statusCode === 302 && isYandex) {
                        //    console.log("302 LINK - "+decodeURIComponent(res.headers.location));
                        //    var redirect = decodeURIComponent(res.headers.location);
                        //    if(!redirect.match(/captcha/)) {
                        //        var redirectObj = redirect.split("?");
                        //        console.info("MAKE ADDITIONAL REQ!!!");
                        //        var reqObj = {
                        //            //path: redirectObj[0],
                        //            path: 'pass.yandex.ua',
                        //            req: redirect.substr(redirectObj[0].length+1),
                        //            cookie: res.headers['set-cookie'].join("; ")
                        //        };
                        //
                        //        self.grab(keyword, proxy, response, true, limit+1, reqObj).then(function(res) {
                        //
                        //        });
                        //
                        //        console.info("END ADDITIONAL REQ!!!");
                        //    }
                        //
                        //
                        //    // make data check
                        //    //var resultChecking  = antigate.process(res.headers.location);
                        //    //resultChecking.then(function(checked) {
                        //    //      console.log("on CAPTCHA: ", checked);
                        //    //}).
                        //    //catch(function(err) {
                        //    //    console.log("on CAPTCHA ERROR: ", err);
                        //    //})
                        //
                        //}

                        //console.log("COOKIE - "+self.cookie);

                        if(res.statusCode !== 200) {

                            console.log("CODE: - "+res.statusCode);

                            response.errorStack.push(JSON.stringify(res.headers));
                            if(response.errorStack.length === limit) decline(response);
                            return;
                        };

                        res.setEncoding('utf8');
                        res.on('data', function(resp) {

                            //console.log("-- DATA CHUNK --");
                            chunked += resp.toString();

                        })
                        .on('end', function() {
                            console.log("-- END REQUEST --");

                            response.data = self.parse(chunked);

                            neo4j.publishLinks(response.data, keyword);
                            console.info("DATA MUST BE RESOLVED");

                            self.chan().send({log: {level:config.log.levels.DATA,
                                message: "KEYWORD '" + decodeURIComponent(keyword) + "' done",
                                data: {
                                    keyword: decodeURIComponent(keyword)
                                }}});

                            resolve(response);
                        })
                        .on('error', function(err) {
                            console.error("ON request: " + searchReq);

                            console.log(err);
                            response.errorStack.push(err);
                            if(response.errorStack.length === limit) decline(response);
                        });
                    });

                    //httpsRequest.setTimeout(3000);

                    httpsRequest.on('error', function(err) {
                        console.error("ON connection: " + searchReq);
                        response.errorStack.push(err);

                        if(response.errorStack.length === limit) decline(response);
                        console.log(err);

                        clearTimeout(timeout);
                        delete timeout;
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
        cookie: "",
        currentCheckedUrls: {},
        checkSolo: false,
        proxy: function(keyword, attempts, isYandex) {

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
                "http://119.40.98.26:8080",
                "http://86.96.229.68:8088",
                "http://86.96.229.123:8088",
                "http://86.96.229.123:80",
                "http://86.96.229.68:80",
                "http://86.96.229.123:8888",
                "http://54.251.177.20:80",
                "http://193.2.156.20:80",
                "http://185.26.181.241:80",
                "http://203.174.44.26:80",
                "http://69.59.153.180:80",
                "http://82.145.210.160:80"
            ], promises = [], self = this, response, proxy, limit = isYandex !== undefined ? 1 : 5, rangeStep = isYandex !== undefined ? 1000 : 2000,
            responseStack = {errorStack: [], data:null};
            //proxies = ["http://86.96.229.68:8888",
            //"http://41.75.81.42:80",
            //"http://68.142.136.252:80",
            //"http://203.174.44.26:80",
            //"http://195.50.71.239:80"];
            return new Promise(function (resolve, decline) {


                /*self.getYandexCookies().then(function (res) {
                    self.cookie = res;
                });*/


                self.getProxies(self.getRandomArbitrary(1,rangeStep), true, limit).then(function(response) {
                     proxies = response;
                    for(proxy of proxies) {
                        promises.push(self.grab(keyword, proxy, responseStack, isYandex, limit));
                    }

                    Promise.race(promises).then(function(result) {

                        console.log("PROXY RACE STEP");
                        console.log(result);

                        resolve(result);
                        //return;
                    },function(err) {


                        console.log(err);
                        console.log("PROXY RACE ERROR - ATTEMPT - "+attempts);
                        ++attempts;

                        var maxAttempts = config.parser.maxAttempts;
                        if(isYandex) maxAttempts = 10;
                        if(attempts < maxAttempts) {
                            return self.proxy(keyword, attempts, isYandex);
                        } else {

                            self.chan().send({log: {level:config.log.levels.ERROR,
                                message: "KEYWORD '" + decodeURIComponent(keyword) + "' ERROR: more than 3 attempts failed to get data",
                                data: {
                                    keyword: decodeURIComponent(keyword)
                                }}});

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
        getProxies: function (page, checked, limit) {
            console.info("GET PROXIES - PAGE: "+page);
            return new Promise(function(resolve, reject) {

                page = page || 1;
                limit = limit || 5;
                console.log("LIMIT "+limit);
                var options = {
                    host: "rank.ria.com",
                    port: 10101,
                    path: "/act?role=mysql&type=proxies&pass=nD54zM1&page="+page+"&limit="+limit+"&status="+checked,
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
        },
        getYandexCookies: function() {

                return new Promise(function(resolve, reject) {
                    var options = {
                            host: "rank.ria.com",
                            port: 10101,
                            path: "/act?role=fm&type=cookies&pass=nD54zM1",
                            method: 'GET'
                        },
                        raw = "",
                        result,

                        response = [], index, tmp, tmpObj, tmpBlock,
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
                                    reject("Empty cookie data!");
                                    return null;
                                }

                                tmp = JSON.parse(result.data);
                                tmpBlock = (tmp['.yandex.ua'] !== undefined) ? tmp['.yandex.ua']['/'] : tmp['yandex.ua']['/'];

                                //console.log(tmpBlock);

                                for(index in tmpBlock) {
                                    tmpObj = tmpBlock[index];
                                    response.push(tmpObj.name +"="+ tmpObj.value);
                                }
                                resolve(response.join("; "));
                            });
                        });

                    request.on('error', function (e) {
                        reject('problem with request: ' + e.message);
                        return null;
                    });
                    console.log("request done!");
                    request.end();
                });
        },
        yandexXml: function(keyword, onlyHighLigth) {
            var self = this, searchResults= [], doc, index = 1, highlight = [], tmpHightlight = {};
            return new Promise(function(resolve, reject) {
                self.makeReqest(
                        "yandex.ru",
                        443,
                        "/search/xml?maxpassages=5&lr=187&groupby=attr%3D%22%22.mode%3Dflat.groups-on-page%3D100.docs-in-group%3D1&user=nikita-ezerscky&key=03.200669049:78961e5072b108e92ca58efe5519cd7d&query="+encodeURIComponent(keyword))
                    .then(function(resp) {
                        if(resp.error) reject(resp.error);

                        parseString(resp.data, function(err, result) {
                            if(err) reject(err);

                            if(result.yandexsearch.response[0].error !== undefined) {
                                reject(result.yandexsearch.response[0].error);
                                return;
                            }

                            result.yandexsearch.response[0].results[0].grouping[0].group.map(function(item) {
                                doc = item.doc[0];
                                highlight = self.parseHighlight(doc.title, highlight, tmpHightlight);
                                highlight = self.parseHighlight(doc.passages, highlight, tmpHightlight);
                                searchResults.push({
                                    src: doc.url[0],
                                    domain: doc.domain[0],
                                    highlight: highlight,
                                    relevance: doc.relevance[0],
                                    position: index
                                });
                                index++;

                            });

                            if(onlyHighLigth) {
                                self.sendHighlight(keyword, highlight, resolve);
                                return;
                            }

                            //console.log(searchResults);
                        });

                })
                .catch(function(err) {
                    console.error(err);
                    reject(err);
                });
            })
        },
        yandexXmlLimits: function() {
            var self = this, searchResults= [], doc, index = 1, highlight = [], tmpHightlight = {};
            return new Promise(function(resolve, reject) {
                self.makeReqest(
                    "yandex.ru",
                    443,
                    "/search/xml?action=limits-info&user=nikita-ezerscky&key=03.200669049:78961e5072b108e92ca58efe5519cd7d")
                    .then(function(resp) {

                        if(resp.error) reject(resp.error);

                        parseString(resp.data, function(err, result) {
                            if(err) reject(err);

                            if(!result.yandexsearch.response) {
                                reject("no data");
                                return;
                            }

                            if(result.yandexsearch.response[0].error !== undefined) {
                                reject(result.yandexsearch.response[0].error);
                                return;
                            }

                            var limits = result.yandexsearch.response[0].limits[0]['time-interval'];
                            resolve(limits.map(function (limit) {
                                return {
                                        limit: limit['_'],
                                        period: limit['$']
                                    };
                            }));

                        });

                    })
                    .catch(function(err) {
                        console.log(err);
                        reject(err);
                    });
            });
        },
        sendHighlight: function(keyword, highlight, resolve) {
            //console.log(keyword);
            //console.log(highlight);

            this.chan().send({log: {level:config.log.levels.INFO,
                message: "по запросу '" + decodeURIComponent(keyword) + "' найдены синонимы",
                data: {
                    keyword: decodeURIComponent(keyword)
                }}});
            resolve(neo4j.insertSynonims(keyword, highlight));
        },
        parseHighlight: function(obj, highlight, tmpHightlight) {
            //console.log(obj);
            var index, currHighlight = [], currObject, lowerised;
            for(index in obj) {
                currObject = obj[index];
                if(index === 'hlword') {
                    lowerised = currObject[0].toLocaleLowerCase();
                    if(tmpHightlight[lowerised]) continue;

                    tmpHightlight[lowerised] = true;
                    currHighlight.push(lowerised);
                    continue;
                }
                if(typeof currObject === 'string') continue;

                highlight = this.parseHighlight(currObject, highlight, tmpHightlight);
            }
            if(currHighlight.length) highlight = highlight.concat(currHighlight);

            return highlight;
        },


        urlChecker: function(target, args) {
            var promised = [], self = this, response = {errorStack: [], data:null},
                pathes = (args.targetPath instanceof Array) ? args.targetPath : [args.targetPath],
                limiter = new RateLimiter(100, 'minute'), langIndex, lang, targetSrc = args.parent || args.targetPath;
            //this.getProxies(this.getRandomArbitrary(1, 2000), true, 5).then(function(list) {


            self.currentCheckedUrls[targetSrc] = {};
            self.currentCheckedUrls[targetSrc].processed = 0; // for 2 langs checked
            self.currentCheckedUrls[targetSrc].processedWithError = 0; // for 2 langs checked


            if(args.checkSolo) this.checkSolo = true;

            if (args.parent && args.parent !== null) {
                elasticsearch.init();
                elasticsearch.scroll({
                    queryParams: {parent: args.parent},
                    fields: ['link'],
                    limit: 100
                }, makeElasticReq);
                return;
            }
            //console.log(args.path);

            self.currentCheckedUrls[targetSrc].total = pathes.length; // for 2 langs checked
            //pathes = setupUkLang(pathes);
            self.checkByLimiter(limiter, {pathes: pathes, target: target, response: response, path:args.targetPath});

            function makeElasticReq(searchResponse, totalItems) {
                var pathes = [];
                return function () {
                    pathes = searchResponse.map(function (item) {
                        return item['doc.link'][0];
                    });
                    //pathes = setupUkLang(pathes);

                    self.currentCheckedUrls[args.parent].total = totalItems; // for 2 langs checked
                    self.checkByLimiter(limiter, {pathes: pathes, target: target, response: response, path:args.targetPath, total: totalItems});
                }
            }

            function setupUkLang(items) {
                return items.concat(items.map(function(link) {
                    return "/uk/"+link.replace(/^\/{1,}/g, "");
                }));
            }
        },
        checkByLimiter: function(limiter, args){
            var self = this, pathes = args.pathes, target = args.target, response = args.response, factory;


            limiter.removeTokens(pathes.length, function(err, remainingRequests) {
                if(err) {
                    console.log(err);
                    console.log("RATE LIMIT");
                    return;
                }


                console.log("REMAIN REQ - "+remainingRequests);
                console.log("COUNT REQ - "+pathes.length);

                pathes.forEach(function(path) {

                    self.httpsRequest(target, path, null, response, 1)
                        .then(function(resp) {

                            if(!resp.data) {

                                self.sendProgress(args.path, false);

                                return;
                            }

                            factory = self.parseFactory(target, resp.data, path);
                            //factory();
                        })
                        .catch(function(err) {
                            console.log(err);
                            self.sendProgress(args.path, false);
                        });
                });
            });
        },

        //
        sendProgress: function(path, isNormal) {
            if(isNormal) {
                this.currentCheckedUrls[path].processed++;
            } else {
                this.currentCheckedUrls[path].processedWithError++;
            }

            var notifyObj = this.currentCheckedUrls[path];
            if(!notifyObj.processedWithError) notifyObj.processedWithError = 0;
            if(!notifyObj.percentile) notifyObj.percentile = 0;

            notifyObj.percentileError = Math.round((notifyObj.processedWithError / notifyObj.total) * 100);
            notifyObj.percentile = Math.round((notifyObj.processed / notifyObj.total)*100);

            notifyObj.totalProgress = notifyObj.percentile+notifyObj.percentileError;

            notifyObj.oldTotalProgress = (notifyObj.oldTotalProgress !== null) ? notifyObj.oldTotalProgress : null;

            if(notifyObj.oldTotalProgress === null || notifyObj.oldTotalProgress !== notifyObj.totalProgress) {
                this.chan().send({progress: {target:path,
                    //data: {
                    //    total: notifyObj.total,
                    //    process: notifyObj.processed,
                    //    processError: notifyObj.processedWithError
                    //},
                    percentileError: notifyObj.percentileError,
                    percentile: notifyObj.percentile,
                    totalProgress: notifyObj.totalProgress}});
                this.currentCheckedUrls[path].oldTotalProgress = notifyObj.totalProgress;
            }

        },

        httpsRequest: function(target, path, proxy, response, limit) {
            var self = this, chunked = "", target = target.replace(/(https|http):\/\//g, "");

            path = encodeURI(path);

            return new Promise(function(resolve, decline) {

                var timeout = setTimeout(function(){
                    console.log("REQ TIMEOUT REACHED!!!");
                    console.log("FOR " + target + " - " + proxy);
                    clearTimeout(timeout);
                    response.errorStack.push("REQ TIMEOUT REACHED FOR PROXY - "+proxy);
                    if(response.errorStack.length === limit) decline(response);
                }, 20000),
                    limit = limit || 5,
                    request = (proxy) ? self.buildRequest(proxy, target) : null,
                    httpsRequest = Https.request({
                        // like you'd do it usually...
                        hostname: target,
                        host: target,
                        port: 443,
                        method: 'GET',
                        path: path,
                        timeout: 10000,
                        followRedirect: true,
                        maxRedirects: 5,
                        gzip: true,
                        headers: {
                            "Content-Type": "text/plain;charset=utf-8"
                            //"Set-Cookie": cookie + "; domain=.yandex.ua; path=/;",
                            //"domain": ".yandex.ua",
                            //"path":"/"
                        }
                        // ... just add the special agent:
                        //agent: request
                    }, function (res) {
                        var allow = {200:true, 301:true};
                        clearTimeout(timeout);
                        if(!allow[res.statusCode]) {
                            console.log("CODE: - "+res.statusCode + " PAGE:"+path);

                            //console.log(res);
                            //
                            response.errorStack.push(JSON.stringify(res.headers));
                            if(response.errorStack.length === limit) decline(response);
                            return;
                        };

                        res.setEncoding('utf8');
                        res.on('data', function(resp) {
                            //console.log("-- DATA CHUNK --");
                            chunked += resp.toString();
                        })
                        .on('end', function() {
                            console.log("-- END REQUEST --");

                            response.data = chunked;

                            //self.chan().send({log: {level:config.log.levels.DATA,
                            //    message: "KEYWORD '" + decodeURIComponent(keyword) + "' done",
                            //    data: {
                            //        keyword: decodeURIComponent(keyword)
                            //    }}});

                            resolve(response);
                        })
                        .on('error', function(err) {
                            console.error("ON request: " + target);

                            console.log(err);
                            response.errorStack.push(err);
                            if(response.errorStack.length === limit) decline(response);
                        });
                    });
                    httpsRequest.on('error', function(err) {
                        console.error("ON connection: " + target);
                        response.errorStack.push(err);

                        if(response.errorStack.length === limit) decline(response);
                        console.log(err);

                        clearTimeout(timeout);

                    });
                    console.log("-- ended --");
                    httpsRequest.end();
            });
        },


        makeReqest: function(host, port, path, reqObj) {

            return new Promise(function(resolve, reject) {
                var options = {
                        host: host,
                        port: port,
                        path: path,
                        method: 'GET'
                    },
                    raw = "",
                    reqObj = reqObj || Https,
                    result,
                    request = reqObj.request(options, function (resp) {
                        if (resp.statusCode !== 200) {
                            console.log(resp);

                            reject({"error": "Error in request!", raw: resp});
                            return null;
                        }
                        resp.setEncoding('utf8');
                        resp.on('data', function (chunk) {
                            raw += chunk;
                        });
                        resp.on('end', function () {
                            if(raw === undefined) {
                                reject({"error": "Empty data!"});
                                return null;
                            }

                            resolve({error: null, data:raw});
                        });
                    });

                request.on('error', function (e) {
                    reject({"error":'problem with request: ' + e.message});
                    return null;
                });
                console.log("end");
                request.end();
            });
        },



        // BLOCK PARSERS
        checkSeo: function(results, pathChunk, lang) {
            pathChunk = pathChunk.replace(/\/uk/g, "");
            var path = config.parser.seoDB.path + pathChunk, reqBody, self = this;


            //couch.get(pathChunk);

            Request('http://'+config.parser.seoDB.host+":"+config.parser.seoDB.port+path, function (error, response, body) {
                if(error || response.statusCode !== 200) {
                    console.log(error);
                }
                try {
                    reqBody = JSON.parse(body);
                } catch (err) {
                    throw new Error("Error parsing body - "+path);
                }

                if(reqBody.code !== 200) {
                    console.log(reqBody);
                    return;
                }

                var targetLink = reqBody.doc.parent ? reqBody.doc.parent : reqBody.doc.link;
                if(self.checkSolo) targetLink = reqBody.doc.link;

                if(!reqBody.doc.blocks) {
                    console.log(reqBody.doc);
                    return;
                }

                if(!reqBody.doc.blocks[lang]) {
                    console.log("EMPTY DOC FOR LANG - "+lang);
                    return;
                }

                self.checkSeoBlocks(reqBody.doc.blocks[lang], results, lang, targetLink);

            });
        },
        checkSeoBlocks: function(doc, blocks, lang, link) {
            if(!doc) {
                throw new Error('blocks element not found in - '+link);
            }

            var keys = Object.keys(blocks), keysLen = keys.length, index, value, complexData = {}, blockItem, block,
                notToCheck = ['img', 'canonical', 'robots'], checkBlocks = {};
            for(index=0;index<keysLen;index++) {
                value = keys[index];
                block = blocks[value];

                if(~notToCheck.indexOf(value)) {
                    complexData[value] = (value == 'img') ? block.counters : block;
                    continue;
                }

                if(value == "seotext" && block.length) {
                    block = decodeStringElemens(block.replace(/\n/g, ""));
                    doc[value] = decodeStringElemens(doc[value].replace(/\n/g, ""));
                }

                if(typeof block !== "string") {
                    if(!block.length) {
                        complexData[value] = "empty";
                        continue;
                    }

                    if(block.length > 1) {
                        complexData[value] = blocks[value];
                        continue;
                    }
                }

                if(!block) {
                    complexData[value] = "empty";
                    continue;
                }

                blockItem = (typeof block !== "string") ? block[0] : block;
                complexData[value] = (doc[value] == blockItem);
            }


            function decodeStringElemens(text) {
                var addCharacterEntities = {
                    '&amp;'     :   '&',
                    '&gt;'      :   '>',
                    '&lt;'      :   '<',
                    '&quot;'    :   '"',
                    '&#39;'     :   "'"
                }, index;
                for(index in addCharacterEntities) {
                    text = text.replace(new RegExp(index), addCharacterEntities[index]);
                }
                return text;
            }

            checkBlocks[lang] = complexData;


            this.sendProgress(link, true);

            console.log(checkBlocks);


        },


        mainParseSelectors: function() {
            return {
                "title": {
                    //"attrs": [{
                    "type": "nodeName",
                    "value": "title"
                    //}]
                },
                "h1": {
                    "type": "nodeName",
                    "value": "h1"
                },
                "description": {
                    "type": "nodeName",
                    "value": "meta",
                    "attrs": [
                        {
                            "type" : "name",
                            "value" : "description"
                        }
                    ]
                },
                "canonical": {
                    "type": "nodeName",
                    "value": "link",
                    "attrs": [
                        {
                            "type" : "rel",
                            "value" : "canonical"
                        }
                    ]
                },
                "img": {
                    "type": "nodeName",
                    "value": "img"
                },
                "robots": {
                    "type": "nodeName",
                    "value": "meta",
                    "attrs": [
                        {
                            "type" : "name",
                            "value" : "robots"
                        }
                    ]
                }
            };
        },

        // PROJECTS PARSERS
        /**
         * RIA COM
         * @param doc - html parse5 object document
         */
        parseBlocksRia: function(doc, chunk, lang) {

            var selectors = this.mainParseSelectors(), serializerLib = new parseLib.Serializer();

            selectors["seotext"] = {
                    "type": "nodeName",
                    "value": "div",
                    "attrs": [{
                        "type" : "class",
                        "value":"informer-block-main-bg hide"
                    }]
                };

            var results = [], parseResults = this.parsePage(selectors, doc), index, result;

            for(index in parseResults) {
                try {
                    results[index] = this.returnParsedData(index, parseResults[index], defaultFunc);
                } catch (err) {
                    console.log(err);
                }
            }

            //console.log(results);

            this.checkSeo(results, chunk, lang);
            //couch.init('seo');

            function defaultFunc(block) {

                if(!block || !block[0]) return null;

                return serializerLib.serialize(block[0]);
            }

        },
        // END

        returnParsedData: function(index, block, defaultFunc) {
            if(!block || !block.length || !block[0] || !block[0].childNodes) return [];

            var indexArr, valueArr = [], imgBlock, imgItem = {}, tmpImages = {};
            switch(index) {
              case "title":

                  valueArr = block[0].childNodes[0].value;
                  break;
              case "h1":

                  if(!block[0].childNodes[0].value) return [];

                  valueArr = block[0].childNodes[0].value.replace(/«(.*)»/g, "$1").trim();
                  break;
              case "description":

                  valueArr = block[0].attrs.filter(this.findItemDesc)[0].value;
                  break;
              case "canonical":

                  for(indexArr in block) {
                      valueArr.push(block[indexArr].attrs.filter(this.findItemCanonical)[0].value);
                  }

                  break;
              case "img":

                  var imgCounters = {}, container, self = this;
                  for(indexArr of block) {
                      container = [];
                      container = self.filterResults(indexArr, tmpImages)();
                      if(!container || !container[0]) continue;

                      if(container[0].src) !imgCounters.src ? imgCounters.src = 1 : imgCounters.src++;
                      if(container[0].title) !imgCounters.title ? imgCounters.title = 1 : imgCounters.title++;
                      if(container[0].alt) !imgCounters.alt ? imgCounters.alt = 1 : imgCounters.alt++;

                      valueArr.push(container[0]);
                  }
                  valueArr = {data: valueArr, counters: imgCounters};
                  break;
                case "robots":

                    valueArr = block[0].attrs.filter(this.findItemDesc);
                    if(valueArr) valueArr = valueArr[0].value;
                    break;
              default:
                  return defaultFunc(block);
            }

            return valueArr;
        },
        filterResults: function(indexArr, tmpImages) {
            var self = this, imgItem = {};
            return function() {
                return indexArr.attrs.filter(self.findItemImg).map(function(img) {
                    imgItem[img.name] = img.value;
                    return imgItem;
                })
                .filter(function(item) {
                    if(!tmpImages[item.src]) {
                        tmpImages[item.src] = true;
                        return true;
                    }
                });
            }
        },

        // FILTERS
        findItemDesc: function(value){
            if(value.name === 'content') return true;
        },
        findItemCanonical: function(value){
            if(value.name === 'href') return true;
        },
        findItemImg: function(value){
            var allowed = ['src', 'title', 'alt'];
            if(~allowed.indexOf(value.name)) return true;
        },
        // END

        parsePage: function(selectors, doc) {
            var results = [], attrs, i, attrLen, hit, selectorIndex, selector, searchBlock = {};
            try {
                for(selectorIndex in selectors) {
                    selector = selectors[selectorIndex];
                    results = [];

                    searchBlock[selectorIndex] = this.findRecurs(doc.childNodes[1], comparator, selector, results);
                }
            } catch(err) {
                console.log(err);
            }

            function comparator(content, selector) {

                if(selector["type"] !== undefined) {
                    if(content[selector["type"]] == selector["value"]) {
                        if(!selector["attrs"]) return content;
                    } else {
                        return null;
                    }
                }

                attrs = content.attrs;
                if(attrs.length > 1) {
                    attrLen = attrs.length;

                    for(i=0;i<attrLen;i++) {
                        hit = returnIfGet(attrs[i], selector["attrs"]);
                        if(!hit) continue;

                        return content;
                    }
                } else {
                    return returnIfGet(attrs[0], selector["attrs"]);
                }
                //}
                function returnIfGet(attr, selectors) {

                    if(!attr) return null;
                    var selectorIndex, selectorItem;
                    for(selectorIndex in selectors) {
                        selectorItem = selectors[selectorIndex];
                        if(
                            attr.name == selectorItem.type
                            && attr.value == selectorItem.value
                        ) {
                            return true;
                        }

                    }

                    return null;
                }

                return null;
            }

            return searchBlock;
        },

        parseFactory: function(domain, raw, target) {
            var lang = target.match(/\/uk\//g) ? "uk" : "ru";
            domain = domain.replace(/((https|http):\/\/)|(\/{0,}uk(\/){0,})/g, "");
            var map = {
                "www.ria.com": "parseBlocksRia"
                },
                pInstance = new Parser();

            try {
                var doc = pInstance.parse(raw);
            } catch(err) {
                console.log(err);
            }


            return this[map[domain]](doc, target, lang);
        }
    };

module.exports = parser;
