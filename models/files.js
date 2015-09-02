var fs = require('fs'),
FileManager = {
    params: {
        defaultDir: '/var/www/html/seo_api/'
    },
    open: function(path, encoding, res, dec) {
        if(!encoding) encoding = 'utf8';

        fs.readFile(path, encoding, function (err,data) {
            if (err) {
                dec(err);
                //console.log(err);
            }
            //console.log(data);
            res(data);
        });
    },
    openYandexCookies: function(path) {

        var self = this;

        return new Promise(function(resolve, reject) {
            if(!path) {
                self.getRandomFile().then(function(res){
                    self.open(res[0], null, resolve, reject);
                });
            } else {
                self.open(path, null, resolve, reject);
            }

        });

    },
    getRandomFile: function() {
        var allowFiles, self = this, rand, res;

        return new Promise(function(resolve, reject) {
            fs.readdir(self.params.defaultDir, function (err, files) {
                if (err) {
                    console.log(err);
                    reject(err);
                }

                allowFiles = files.filter(function (file) {
                    return file.match(/\.js/);
                });
                rand = self.getRandomInt(0, allowFiles.length);
                resolve(allowFiles.slice(rand, rand + 1));
            });
        });
    },
    getRandomInt: function(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
};
module.exports = FileManager;