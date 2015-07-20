var http = require('http'),
    //ASQ = require('asynquence'),
    Prodvigator = {
    params: {
        host: "prodvigator.ua",
        path: "/api/v2/url_keywords?page=1&page_size=10",
        token: "990f3b5aadb8bcfe54f7dd013001ce81"
    },
    projects: {
        1: "auto.ria.com",
        2: "www.ria.com",
        3: "dom.ria.com",
        5: "market.ria.com"
    },
    getItem: function(reqParams) {
        var self = this;
        return new Promise( function(done,reject) {

            if (!reqParams) done({"error": 'Error with empty params'});
            if (typeof reqParams !== "object") done({"error": 'TypeError: params must be an object!'});
            var options = {
                    host: self.params.host,
                    port: 80,
                    path: self.params.path + "&token=" + self.params.token + "&query=http://" + self.projects[reqParams.projectId] + "/" + reqParams.link,
                    method: 'GET'
                },
                error = null,
                request = http.request(options, function (resp) {
                    console.log('STATUS: ' + resp.statusCode);
                    if (resp.statusCode !== 200) {
                        done({"error": "Error in request!", data: resp});
                    }

                    resp.setEncoding('utf8');
                    resp.on('data', function (chunk) {
                        done({"error": error, "data": JSON.parse(chunk)});
                    });
                });

            request.on('error', function (e) {
                //console.log('problem with request: ' + e.message);
                done({"error": e.message, "raw": e});
            });

            console.log("request done!");
            request.end();
        });
        //self.generic.next();
    },
    list: function (link, projectId, saveToDb) {
        var resp, self = this, linksArray = [], functs = [], funct, linkItem;

        return new Promise( function(resolve, reject) {

            if(typeof link === "string") {
                // toDo LOG
                if(link.length < 5) {
                    resp = {error: "no link provided or link has less 5 symbols"};
                    reject(resp);
                }

                linksArray.push(link);
            }

            if(typeof link === "object") {
                if(!link instanceof Array) {
                    resp = {error: "TypeError: link isn't an array!"};
                    reject(resp);
                }
                linksArray = link;
            }

            for(linkItem of linksArray) {
                funct = self.getItem({projectId: projectId, link: linkItem});
                functs.push(funct);
            }

            Promise.all(functs)
            .then(
              function(items) {
                //console.log(items);
                resolve(items);
              }
            ).catch(
              function( exeption ) {
                  console.warn( exeption );
                  reject({error: JSON.stringify(exeption)});
                  // 'third'
              }
            );

            //console.log(functs);

        });

    },
    runGenerator: function *(link, projectId){
        try {
            var result = yield this.list(link, projectId);
        }
        catch (err) {
            return err;
        }
        return result;
    },

    check: function *(link, projectId) {
        var item, res;
        if(!link || !projectId) {
            // toDo LOG
            res = yield {error: "no link or project provided"};
            return res;
        }
        res = yield this.runGenerator(link, projectId);

        return res;
    },
    seek: function *(link) {
        if(!link) {
            // toDo LOG
            yield {error: "no link provided"};
            return;
        }

        yield null;
    },
    generic: null,
    itemsList: {}
};

module.exports = Prodvigator;
